import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { SolicitudActivacionEcf, EstadoSolicitudActivacion } from './entities/solicitud-activacion-ecf.entity';
import { CertificadoPfxService, MetadatosCertificado } from './certificado-pfx.service';
import { TenantService } from '../tenant/tenant.service';
import { S3Service } from '../common/s3/s3.service';
import { IntentosCertificadoService } from './intentos-certificado.service';
import { precioPara, tarifasVigentes, TARIFA_ACTIVACION_VERSION } from './tarifas-activacion';

const COMPROBANTES_FOLDER = 'comprobantes-activacion';

@Injectable()
export class ActivacionEcfService {
  private readonly logger = new Logger(ActivacionEcfService.name);

  constructor(
    @InjectRepository(SolicitudActivacionEcf)
    private readonly repo: Repository<SolicitudActivacionEcf>,
    private readonly certificadoSvc: CertificadoPfxService,
    private readonly tenantService: TenantService,
    private readonly s3Service: S3Service,
    private readonly intentos: IntentosCertificadoService,
    private readonly ds: DataSource,
  ) {}

  private get eid(): number { return this.tenantService.getEmpresaId(); }

  /** Tarifas vigentes. El frontend las pide, no las conoce. */
  tarifas() { return tarifasVigentes(); }

  /**
   * Valida un PFX y devuelve el precio que le corresponde — SIN crear nada.
   *
   * El cliente ve el monto ANTES de enviar, y cambia al subir el certificado.
   * Nada de descubrir el precio después.
   *
   * El PFX NO se guarda: se abre, se leen tres metadatos y el buffer se
   * sobrescribe. Ver certificado-pfx.service.
   */
  async validarCertificado(
    pfx: Buffer, clave: string, usuarioId: number, ip: string,
  ): Promise<{
    metadatos: MetadatosCertificado;
    precio: number;
    mensaje: string | null;
  }> {
    const empresaId = this.eid;

    // Se comprueba ANTES de tocar el archivo: si esta bloqueado, el PFX ni se abre.
    await this.intentos.exigirNoBloqueado(empresaId, ip);

    let metadatos: MetadatosCertificado;
    try {
      metadatos = this.certificadoSvc.validar(pfx, clave);
    } catch (e) {
      // Clave incorrecta o archivo ilegible: cuenta como intento fallido y deja
      // rastro con empresa y usuario — nunca con el archivo ni la clave.
      await this.intentos.registrarFallo(empresaId, usuarioId, ip);
      throw e;
    }
    await this.intentos.registrarExito(empresaId, ip);

    const precio = precioPara(metadatos.valido);

    let mensaje: string | null = null;
    if (metadatos.vencido && metadatos.venceEn) {
      // Se dice desde cuándo: "vencido" a secas obliga a ir a buscar el dato.
      const desde = metadatos.venceEn.toLocaleDateString('es-DO', {
        timeZone: 'America/Santo_Domingo', day: '2-digit', month: '2-digit', year: 'numeric',
      });
      mensaje =
        `El certificado está vencido desde el ${desde}. Un certificado vencido no ` +
        `sirve para facturar, así que la implementación se cotiza como si no lo tuvieras. ` +
        `Si renuevas el certificado, vuelve a subirlo y el precio se ajusta.`;
    }

    return { metadatos, precio, mensaje };
  }

  /**
   * Crea la solicitud con el precio CONGELADO.
   *
   * Los metadatos del certificado llegan de una validación previa; si el cliente
   * dice tener certificado, se revalida aquí con el archivo para que el precio
   * no dependa de lo que mande el cliente en el body.
   */
  async crear(datos: {
    usuarioId: number;
    contactoNombre?: string;
    contactoEmail?: string;
    contactoTelefono?: string;
    notas?: string;
    pfx?: Buffer;
    clavePfx?: string;
    ip?: string;
  }): Promise<SolicitudActivacionEcf> {
    const empresaId = this.eid;

    const yaAbierta = await this.repo.findOne({
      where: [
        { empresaId, estado: EstadoSolicitudActivacion.PENDIENTE_PAGO },
        { empresaId, estado: EstadoSolicitudActivacion.PAGO_RECIBIDO },
        { empresaId, estado: EstadoSolicitudActivacion.EN_PROCESO },
      ],
    });
    if (yaAbierta) {
      throw new BadRequestException(
        `Ya tienes una solicitud de activación en curso (#${yaAbierta.id}). ` +
        `Espera a que se resuelva antes de enviar otra.`,
      );
    }

    // El precio NO se acepta del cliente: se calcula aquí, con el archivo.
    let metadatos: MetadatosCertificado = {
      valido: false, venceEn: null, titular: null, vencido: false,
    };
    if (datos.pfx?.length) {
      // Mismo freno que en validar-certificado: crear una solicitud tambien
      // abre el PFX con una clave, asi que sirve igual de oraculo.
      await this.intentos.exigirNoBloqueado(empresaId, datos.ip ?? 'desconocida');
      try {
        metadatos = this.certificadoSvc.validar(datos.pfx, datos.clavePfx ?? '');
      } catch (e) {
        await this.intentos.registrarFallo(empresaId, datos.usuarioId, datos.ip ?? 'desconocida');
        throw e;
      }
    }

    const solicitud = this.repo.create({
      empresaId,
      estado:                 EstadoSolicitudActivacion.PENDIENTE_PAGO,
      montoAcordado:          precioPara(metadatos.valido),
      tarifaVersion:          TARIFA_ACTIVACION_VERSION,
      tieneCertificado:       metadatos.valido,
      certificadoVenceEn:     metadatos.venceEn,
      certificadoTitular:     metadatos.titular,
      certificadoVencido:     metadatos.vencido,
      contactoNombre:         datos.contactoNombre ?? null,
      contactoEmail:          datos.contactoEmail ?? null,
      contactoTelefono:       datos.contactoTelefono ?? null,
      notas:                  datos.notas ?? null,
      solicitadoPorUsuarioId: datos.usuarioId,
    });

    const guardada = await this.repo.save(solicitud);
    this.logger.log(
      `Solicitud de activación #${guardada.id} — empresa ${empresaId} · ` +
      `certificado=${metadatos.valido} · monto=${guardada.montoAcordado}`,
    );
    return guardada;
  }

  /**
   * Decide si el módulo debe verse y en qué modo.
   *
   * UN SOLO SITIO DECIDE. Lo consultan el menú y la pantalla: si cada uno
   * calculara por su cuenta acabarían discrepando, y el usuario vería una
   * entrada que lleva a algo que no le corresponde.
   *
   * `ya-activo` cuando la empresa ya factura electrónicamente:
   *
   *   (config activa Y en PRODUCCIÓN Y con credenciales MSeller)
   *   O la última solicitud está en 'activada'
   *
   * Las tres condiciones de la config son necesarias. Una config en **TEST** es
   * una activación a medias: la empresa todavía no factura de verdad, y
   * ocultarle el módulo la dejaría sin vía para pedir que se lo terminen. Y
   * `activo = true` sin credenciales es una fila creada pero sin configurar.
   *
   * La segunda rama tapa una ventana real: si se marca la solicitud como
   * activada ANTES de configurar MSeller, sin ella al cliente le volvería a
   * salir el formulario de alta como si nunca hubiera pedido nada.
   */
  async estado(): Promise<{
    visible: boolean;
    modo: 'formulario' | 'estado-solicitud' | 'ya-activo';
    solicitud: SolicitudActivacionEcf | null;
  }> {
    const empresaId = this.eid;

    const [cfg] = await this.ds.query<{
      activo: boolean; modo: string; tieneCredenciales: boolean;
    }[]>(
      `SELECT activo, modo,
              ("msellerEmail" IS NOT NULL AND "msellerPasswordEnc" IS NOT NULL) AS "tieneCredenciales"
         FROM empresa_ecf_config
        WHERE "empresaId" = $1
        LIMIT 1`,
      [empresaId],
    );

    const configLista = !!cfg?.activo && cfg?.modo === 'PRODUCCION' && !!cfg?.tieneCredenciales;
    const solicitud   = await this.miSolicitud();
    const yaActivada  = solicitud?.estado === EstadoSolicitudActivacion.ACTIVADA;

    if (configLista || yaActivada) {
      return { visible: false, modo: 'ya-activo', solicitud };
    }

    // Una solicitud rechazada no bloquea: el cliente puede volver a intentarlo.
    const enCurso = solicitud && solicitud.estado !== EstadoSolicitudActivacion.RECHAZADA;
    return {
      visible: true,
      modo:    enCurso ? 'estado-solicitud' : 'formulario',
      solicitud: enCurso ? solicitud : null,
    };
  }

  /** La solicitud de ESTA empresa. Sin filtro no hay aislamiento. */
  async miSolicitud(): Promise<SolicitudActivacionEcf | null> {
    return this.repo.findOne({
      where: { empresaId: this.eid },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Adjunta el comprobante de pago. Se puede hacer después de enviar: un
   * cliente solicita hoy y paga mañana.
   *
   * Va al bucket de media guardando la KEY, no la URL. Es un recibo, no una
   * credencial — a diferencia del certificado, que no se guarda en ningún sitio.
   */
  async adjuntarComprobante(
    solicitudId: number, buffer: Buffer, nombreOriginal: string, mimetype: string,
  ): Promise<{ key: string }> {
    const empresaId = this.eid;
    const solicitud = await this.repo.findOne({ where: { id: solicitudId, empresaId } });
    if (!solicitud) throw new NotFoundException('Solicitud no encontrada');

    const ext = (nombreOriginal.split('.').pop() ?? 'bin').toLowerCase().substring(0, 5);
    const key = await this.s3Service.uploadKey(
      buffer, `comprobante-${solicitudId}.${ext}`, mimetype, COMPROBANTES_FOLDER, empresaId,
    );
    if (!key) {
      throw new BadRequestException(
        'No se pudo guardar el comprobante — el almacenamiento no está disponible. Inténtalo de nuevo.',
      );
    }

    await this.repo.update(solicitud.id, {
      comprobantePagoKey:  key,
      comprobanteSubidoEn: new Date(),
    });
    this.logger.log(`Comprobante adjuntado a solicitud #${solicitudId} (empresa ${empresaId})`);
    return { key };
  }

  // ══ Super Admin ═══════════════════════════════════════════════════════════
  //
  // Estos métodos NO filtran por empresaId a propósito: los llama el panel de
  // plataforma, que ve todas las empresas. El guard del controlador es lo que
  // restringe el acceso.

  async listarTodas(estado?: string) {
    const filas = await this.ds.query<any[]>(
      `SELECT s.*, e.nombre AS "empresaNombre", e.rnc AS "empresaRnc"
         FROM solicitudes_activacion_ecf s
         JOIN empresa e ON e.id = s."empresaId"
        ${estado ? 'WHERE s.estado = $1' : ''}
        ORDER BY s."createdAt" DESC`,
      estado ? [estado] : [],
    );
    return filas.map(f => ({ ...f, montoAcordado: Number(f.montoAcordado) }));
  }

  /** URL firmada del comprobante — 15 min. Nunca pública. */
  async urlComprobante(solicitudId: number): Promise<string | null> {
    const [fila] = await this.ds.query<{ comprobantePagoKey: string | null }[]>(
      `SELECT "comprobantePagoKey" FROM solicitudes_activacion_ecf WHERE id = $1`,
      [solicitudId],
    );
    if (!fila?.comprobantePagoKey) return null;
    return this.s3Service.getSignedUrl(fila.comprobantePagoKey, 900);
  }

  /**
   * Cambia el estado. ACTIVADA no activa nada por sí sola: es Jean quien
   * configura MSeller a mano y luego marca la solicitud. Esta fila documenta,
   * no dispara.
   */
  async cambiarEstado(
    solicitudId: number, nuevo: EstadoSolicitudActivacion, adminId: number, motivo?: string,
  ) {
    const [fila] = await this.ds.query<any[]>(
      `SELECT id, estado FROM solicitudes_activacion_ecf WHERE id = $1`, [solicitudId],
    );
    if (!fila) throw new NotFoundException('Solicitud no encontrada');

    if (nuevo === EstadoSolicitudActivacion.RECHAZADA && !motivo?.trim()) {
      throw new BadRequestException('Una solicitud rechazada necesita un motivo.');
    }

    const extra: Record<string, any> = {};
    if (nuevo === EstadoSolicitudActivacion.PAGO_RECIBIDO) {
      extra.pagoConfirmadoEn = new Date();
      extra.pagoConfirmadoPorUsuarioId = adminId;
    }
    if (nuevo === EstadoSolicitudActivacion.ACTIVADA) extra.activadaEn = new Date();
    if (nuevo === EstadoSolicitudActivacion.RECHAZADA) extra.motivoRechazo = motivo!.trim();

    await this.ds.getRepository(SolicitudActivacionEcf).update(solicitudId, {
      estado: nuevo, ...extra,
    });

    this.logger.log(
      `Solicitud #${solicitudId}: ${fila.estado} → ${nuevo} por usuario #${adminId}` +
      (motivo ? ` — ${motivo}` : ''),
    );
    return this.ds.getRepository(SolicitudActivacionEcf).findOne({ where: { id: solicitudId } });
  }
}
