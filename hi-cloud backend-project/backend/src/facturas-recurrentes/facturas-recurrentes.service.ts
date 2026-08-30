import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual, DataSource, ILike } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import {
  FacturaRecurrente, Frecuencia, ModoEmision, FormaPago,
} from './entities/factura-recurrente.entity';
import { Factura } from '../facturas/entities/factura.entity';
import { PaginationDto } from '../common/dto/pagination.dto';
import { User } from '../users/users.entity';
import { TenantService } from '../tenant/tenant.service';
import { EmailService } from '../notificaciones/services/email.service';
import { FacturaEmailService } from '../facturas/services/factura-email.service';
import { fechaHoyRD } from '../common/utils/fecha-local.util';
import { CreateRecurrenteDto, UpdateRecurrenteDto } from './dto/factura-recurrente.dto';
import {
  ReglaCalendario, primeraGeneracion, aFechaISO, explicarDiaMes,
} from './calendario-recurrente';
import {
  GeneracionRecurrenteService, ResultadoCiclo,
} from './services/generacion-recurrente.service';
import { EmisionRecurrenteService } from './services/emision-recurrente.service';

/** Lo que se le cuenta a los administradores de una empresa tras el barrido. */
interface ResumenEmpresa {
  generadas: number;
  errores:   number;
  folios:    string[];
  /** Plantillas que se saltaron ciclos porque el servidor no corrió. */
  saltos:    Array<{ nombre: string; ciclos: number }>;
  /** Plantillas que no pudieron generar, con el motivo en palabras. */
  fallos:    Array<{ nombre: string; motivo: string }>;
  /**
   * Facturas que se generaron pero NO se pudieron emitir con e-CF.
   * `fase: 'previa'` = no se pidió número y la factura sigue en borrador.
   * `fase: 'envio'`  = el número existe con su fila; falló el envío a MSeller.
   */
  emisionesFallidas: Array<{
    nombre: string; folio: string; motivo: string; fase: 'previa' | 'envio';
  }>;
  /** Facturas generadas cuyo correo al cliente no salio. No deshacen nada. */
  correosFallidos: Array<{ folio: string; destino: string | null; motivo: string }>;
}

@Injectable()
export class FacturasRecurrentesService {
  private readonly logger = new Logger(FacturasRecurrentesService.name);

  constructor(
    @InjectRepository(FacturaRecurrente)
    private recurrenteRepository: Repository<FacturaRecurrente>,
    @InjectRepository(Factura)
    private facturaRepository: Repository<Factura>,
    @InjectDataSource() private ds: DataSource,
    private tenantService: TenantService,
    private emailService:  EmailService,
    private facturaEmail:  FacturaEmailService,
    private generacion:    GeneracionRecurrenteService,
    private emision:       EmisionRecurrenteService,
    private config:        ConfigService,
  ) {}

  // ──────────────────────────────────────────────────────────────────────────
  // Calendario
  // ──────────────────────────────────────────────────────────────────────────

  /** La plantilla, vista como regla de calendario. */
  private regla(rec: FacturaRecurrente): ReglaCalendario {
    return {
      frecuencia:  rec.frecuencia,
      diaMes:      rec.diaMes,
      diaSemana:   rec.diaSemana,
      fechaInicio: aFechaISO(rec.fechaInicio) ?? fechaHoyRD(),
    };
  }

  /**
   * Comprueba que la frecuencia trae el día que necesita.
   *
   * El campo viejo (`diaEjecucion`) se pedía siempre y sólo se miraba en la
   * rama mensual: en semanal, diaria y anual el número que tecleaba el usuario
   * no hacía nada. Ahora cada frecuencia declara lo que usa y se rechaza lo que
   * no encaja, en vez de aceptarlo y tirarlo.
   */
  private validarRegla(
    frecuencia: Frecuencia, diaMes?: number | null, diaSemana?: number | null,
  ): { diaMes: number | null; diaSemana: number | null } {
    if (frecuencia === Frecuencia.SEMANAL) {
      if (!diaSemana) {
        throw new BadRequestException(
          'Una recurrente semanal necesita el día de la semana (1=lunes … 7=domingo).',
        );
      }
      return { diaMes: null, diaSemana };
    }

    if (frecuencia === Frecuencia.MENSUAL || frecuencia === Frecuencia.ANUAL) {
      if (!diaMes) {
        throw new BadRequestException(
          `Una recurrente ${frecuencia} necesita el día del mes (1 al 31).`,
        );
      }
      return { diaMes, diaSemana: null };
    }

    // Diaria: no hay día que elegir.
    return { diaMes: null, diaSemana: null };
  }

  /** Normaliza los ítems que llegan del formulario. */
  private normalizarDetalles(detalles: CreateRecurrenteDto['detalles']) {
    return detalles.map((d, i) => ({
      descripcion:    String(d.descripcion ?? '').trim() || `Ítem ${i + 1}`,
      productoId:     d.productoId != null ? Number(d.productoId) : undefined,
      cantidad:       Number(d.cantidad),
      precioUnitario: Number(d.precioUnitario),
      porcentajeIva:  Number(d.porcentajeIva ?? 0),
    }));
  }

  /**
   * Comprueba la coherencia entre modo de emisión, tipo de e-CF y forma de pago.
   *
   * Aquí sólo se valida la FORMA (que los campos encajen entre sí). Que la
   * empresa tenga secuencia viva para ese tipo y configuración de MSeller se
   * comprueba en cada generación, porque una secuencia se agota o se vence
   * después de haber guardado la plantilla.
   */
  private validarEmisionYPago(dto: {
    modoEmision?: ModoEmision; tipoEcf?: string;
    formaPago?: number; diasCredito?: number;
  }) {
    const modo = dto.modoEmision ?? ModoEmision.BORRADOR;
    if (modo === ModoEmision.ECF && !dto.tipoEcf) {
      throw new BadRequestException(
        'Para emitir con comprobante fiscal hay que elegir el tipo de e-CF.',
      );
    }
    if (modo === ModoEmision.BORRADOR && dto.tipoEcf) {
      throw new BadRequestException(
        'El tipo de e-CF sólo aplica cuando la plantilla emite con comprobante fiscal.',
      );
    }

    const forma = dto.formaPago ?? FormaPago.EFECTIVO;
    const dias  = Number(dto.diasCredito ?? 0);
    if (forma === FormaPago.CREDITO && dias <= 0) {
      throw new BadRequestException(
        'Una recurrente a crédito necesita el plazo en días: de ahí sale la fecha ' +
        'de vencimiento de la cuenta por cobrar.',
      );
    }
    if (forma !== FormaPago.CREDITO && dias > 0) {
      throw new BadRequestException(
        'El plazo en días sólo aplica a la forma de pago "crédito".',
      );
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // CRUD
  // ──────────────────────────────────────────────────────────────────────────

  async crear(dto: CreateRecurrenteDto, usuario: User) {
    const { diaMes, diaSemana } = this.validarRegla(
      dto.frecuencia, dto.diaMes, dto.diaSemana,
    );
    this.validarEmisionYPago(dto);

    const fechaInicio = dto.fechaInicio.substring(0, 10);
    const fechaFin    = dto.fechaFin ? dto.fechaFin.substring(0, 10) : null;
    if (fechaFin && fechaFin < fechaInicio) {
      throw new BadRequestException('La fecha de fin no puede ser anterior a la de inicio.');
    }

    const proxima = primeraGeneracion({
      frecuencia: dto.frecuencia, diaMes, diaSemana, fechaInicio,
    });
    if (fechaFin && proxima > fechaFin) {
      throw new BadRequestException(
        `Con esa fecha de fin (${fechaFin}) no llega a generarse ninguna factura: ` +
        `la primera caería el ${proxima}.`,
      );
    }

    const rec = this.recurrenteRepository.create({
      empresaId:        this.tenantService.getEmpresaId(),
      nombre:           dto.nombre.trim(),
      clienteId:        dto.clienteId,
      detalles:         this.normalizarDetalles(dto.detalles),
      frecuencia:       dto.frecuencia,
      diaMes:           diaMes ?? undefined,
      diaSemana:        diaSemana ?? undefined,
      fechaInicio:      fechaInicio as unknown as Date,
      proximaEjecucion: proxima as unknown as Date,
      fechaFin:         (fechaFin ?? undefined) as unknown as Date | undefined,
      modoEmision:      dto.modoEmision ?? ModoEmision.BORRADOR,
      tipoEcf:          dto.tipoEcf,
      formaPago:        dto.formaPago ?? FormaPago.EFECTIVO,
      diasCredito:      Number(dto.diasCredito ?? 0),
      emailCliente:     dto.emailCliente ?? true,
      avisoPrevioDias:  Number(dto.avisoPrevioDias ?? 0),
      notas:            dto.notas,
      userId:           usuario.id,
      activa:           true,
    });

    const guardada = await this.recurrenteRepository.save(rec);
    this.logger.log(
      `[Recurrentes] Creada "${guardada.nombre}" (#${guardada.id}) | ` +
      `${guardada.frecuencia} | primera generación ${proxima} | ` +
      `${guardada.modoEmision === ModoEmision.ECF ? guardada.tipoEcf : 'borrador'}`,
    );
    return this.findById(guardada.id);
  }

  /**
   * Editar la plantilla.
   *
   * Sin esto sólo se podía borrar y rehacer, y con e-CF automático de por medio
   * eso puede acabar en dos comprobantes el mismo mes: la plantilla nueva
   * arranca con `ultimaEjecucion` en blanco, así que la guarda de duplicado ya
   * no ve la factura que sacó la vieja.
   *
   * Cambiar la frecuencia o el día recalcula la próxima generación desde HOY,
   * no desde el arranque original: si alguien mueve una mensual del 5 al 20 el
   * día 10, quiere que la próxima sea el 20 de este mes.
   */
  async actualizar(id: number, dto: UpdateRecurrenteDto) {
    const rec = await this.findById(id);

    const frecuencia = dto.frecuencia ?? rec.frecuencia;
    const cambiaRegla = dto.frecuencia !== undefined
      || dto.diaMes    !== undefined
      || dto.diaSemana !== undefined
      || dto.fechaInicio !== undefined;

    const { diaMes, diaSemana } = this.validarRegla(
      frecuencia,
      dto.diaMes    !== undefined ? dto.diaMes    : rec.diaMes,
      dto.diaSemana !== undefined ? dto.diaSemana : rec.diaSemana,
    );

    this.validarEmisionYPago({
      modoEmision: dto.modoEmision ?? rec.modoEmision,
      // Cambiar a borrador limpia el tipo; si no, se conserva el que hubiera.
      tipoEcf: dto.modoEmision === ModoEmision.BORRADOR
        ? undefined
        : (dto.tipoEcf ?? rec.tipoEcf),
      formaPago:   dto.formaPago   ?? rec.formaPago,
      diasCredito: dto.diasCredito ?? rec.diasCredito,
    });

    const fechaInicio = dto.fechaInicio
      ? dto.fechaInicio.substring(0, 10)
      : (aFechaISO(rec.fechaInicio) ?? fechaHoyRD());

    const fechaFin = dto.fechaFin === undefined
      ? aFechaISO(rec.fechaFin)
      : (dto.fechaFin ? dto.fechaFin.substring(0, 10) : null);

    if (fechaFin && fechaFin < fechaInicio) {
      throw new BadRequestException('La fecha de fin no puede ser anterior a la de inicio.');
    }

    const patch: Partial<FacturaRecurrente> = {};
    if (dto.nombre    !== undefined) patch.nombre    = dto.nombre.trim();
    if (dto.clienteId !== undefined) patch.clienteId = dto.clienteId;
    if (dto.detalles  !== undefined) patch.detalles  = this.normalizarDetalles(dto.detalles);
    if (dto.notas     !== undefined) patch.notas     = dto.notas;
    if (dto.activa    !== undefined) patch.activa    = dto.activa;
    if (dto.emailCliente    !== undefined) patch.emailCliente    = dto.emailCliente;
    if (dto.avisoPrevioDias !== undefined) patch.avisoPrevioDias = dto.avisoPrevioDias;
    if (dto.formaPago       !== undefined) patch.formaPago       = dto.formaPago;
    if (dto.diasCredito     !== undefined) patch.diasCredito     = dto.diasCredito;

    if (dto.modoEmision !== undefined) {
      patch.modoEmision = dto.modoEmision;
      patch.tipoEcf = dto.modoEmision === ModoEmision.BORRADOR
        ? undefined
        : (dto.tipoEcf ?? rec.tipoEcf);
    } else if (dto.tipoEcf !== undefined) {
      patch.tipoEcf = dto.tipoEcf;
    }

    patch.frecuencia  = frecuencia;
    patch.diaMes      = diaMes    ?? undefined;
    patch.diaSemana   = diaSemana ?? undefined;
    patch.fechaInicio = fechaInicio as unknown as Date;
    patch.fechaFin    = (fechaFin ?? undefined) as unknown as Date | undefined;

    if (cambiaRegla) {
      const hoy   = fechaHoyRD();
      const desde = fechaInicio > hoy ? fechaInicio : hoy;
      patch.proximaEjecucion = primeraGeneracion({
        frecuencia, diaMes, diaSemana, fechaInicio: desde,
      }) as unknown as Date;
    }

    await this.recurrenteRepository.update(id, patch as any);

    const actualizada = await this.findById(id);
    this.logger.log(
      `[Recurrentes] Editada "${actualizada.nombre}" (#${id})` +
      (cambiaRegla ? ` | próxima generación → ${aFechaISO(actualizada.proximaEjecucion)}` : ''),
    );
    return actualizada;
  }

  async listar(pagination: PaginationDto & { activa?: string; modoEmision?: string }) {
    const { limit = 10, page = 1, search } = pagination;
    const empresaId = this.tenantService.getEmpresaId();

    // El buscador del listado mandaba ?search= desde el primer día y aquí no se
    // leía nunca: escribir en la caja no filtraba nada.
    const where: Record<string, unknown> = { empresaId, isActive: true };
    if (pagination.activa === 'true')  where.activa = true;
    if (pagination.activa === 'false') where.activa = false;
    if (pagination.modoEmision) where.modoEmision = pagination.modoEmision;

    const filtros = search?.trim()
      ? [
          { ...where, nombre: ILike(`%${search.trim()}%`) },
          { ...where, cliente: { nombre: ILike(`%${search.trim()}%`) } },
        ]
      : where;

    const [data, total] = await this.recurrenteRepository.findAndCount({
      where: filtros as any,
      relations: ['cliente', 'user'],
      order: { activa: 'DESC', proximaEjecucion: 'ASC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      data: data.map(r => this.conProximaLegible(r)),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findById(id: number) {
    const r = await this.recurrenteRepository.findOne({
      where: { id, empresaId: this.tenantService.getEmpresaId(), isActive: true },
      relations: ['cliente', 'user'],
    });
    if (!r) throw new NotFoundException(`Factura recurrente #${id} no encontrada`);
    return this.conProximaLegible(r);
  }

  /**
   * Añade a la plantilla la fecha exacta de la próxima generación y la frase
   * que explica qué pasa en los meses cortos, para que la interfaz no tenga que
   * reimplementar el calendario.
   */
  private conProximaLegible(rec: FacturaRecurrente): FacturaRecurrente & {
    proximaGeneracion: string | null;
    explicacionDia:    string | null;
  } {
    const proxima = aFechaISO(rec.proximaEjecucion);
    const fin     = aFechaISO(rec.fechaFin);
    const vigente = rec.activa && (!fin || !proxima || proxima <= fin);

    return Object.assign(rec, {
      proximaGeneracion: vigente ? proxima : null,
      explicacionDia:
        rec.frecuencia === Frecuencia.MENSUAL && rec.diaMes
          ? explicarDiaMes(rec.diaMes)
          : null,
    });
  }

  async toggleActiva(id: number) {
    const r = await this.findById(id);
    await this.recurrenteRepository.update(id, { activa: !r.activa });
    return this.findById(id);
  }

  async remove(id: number) {
    await this.findById(id);
    await this.recurrenteRepository.update(id, { isActive: false });
    return { message: 'Factura recurrente eliminada' };
  }

  /** Historial de facturas generadas por una plantilla recurrente. */
  async historialRecurrente(id: number, pagination: PaginationDto) {
    await this.findById(id); // lanza 404 si no existe
    const page  = pagination.page  ?? 1;
    const limit = pagination.limit ?? 10;
    const [data, total] = await this.facturaRepository.findAndCount({
      where:  { facturaRecurrenteId: id, isActive: true },
      order:  { createdAt: 'DESC' },
      skip:   (page - 1) * limit,
      take:   limit,
      select: [
        'id', 'folio', 'fecha', 'estado', 'total', 'subtotal', 'iva',
        'createdAt', 'clienteId', 'tipoNcf', 'ecfId', 'notas',
        'emailEstado', 'emailEnviadoAt', 'emailDestino', 'emailError',
      ],
    });
    return { data, meta: { total, page, pageSize: limit } };
  }

  // ──────────────────────────────────────────────────────────────────
  // Cron diario: generar facturas que toca hoy
  // ──────────────────────────────────────────────────────────────────
  //
  // 05:10 UTC = 01:10 en República Dominicana.
  //
  // Antes era '15 0 * * *', que en un servidor UTC dispara a las 20:15 hora RD
  // del día ANTERIOR. Con la factura en borrador daba igual; en cuanto la
  // plantilla emite e-CF, no: la fecha de la factura salía del `new Date()` del
  // proceso —es decir, la fecha UTC, ya del día siguiente— y una FechaEmision
  // en el futuro es un rechazo de la DGII. Ahora la hora cae de madrugada RD y
  // la fecha sale de fechaHoyRD().

  @Cron('10 5 * * *')
  async generarFacturasDiarias() {
    const hoyISO = fechaHoyRD();

    const pendientes = await this.recurrenteRepository.find({
      where: {
        activa: true,
        isActive: true,
        proximaEjecucion: LessThanOrEqual(hoyISO as unknown as Date),
      },
      relations: ['cliente'],
    });

    if (pendientes.length === 0) return;

    this.logger.log(`Generando ${pendientes.length} facturas recurrentes...`);

    const resumenPorEmpresa = new Map<number, ResumenEmpresa>();
    const resumenDe = (empresaId: number): ResumenEmpresa => {
      const r = resumenPorEmpresa.get(empresaId)
        ?? { generadas: 0, errores: 0, folios: [], saltos: [], fallos: [],
             emisionesFallidas: [], correosFallidos: [] };
      resumenPorEmpresa.set(empresaId, r);
      return r;
    };

    for (const rec of pendientes) {
      const resumen = rec.empresaId ? resumenDe(rec.empresaId) : null;
      try {
        const ciclo = await this.generacion.ejecutarCiclo(rec, hoyISO);

        if (ciclo.estado === 'finalizada') continue;
        if (ciclo.estado === 'omitida') {
          this.logger.log(`[Recurrentes] "${rec.nombre}" omitida: ${ciclo.motivo}`);
          continue;
        }

        if (resumen) {
          resumen.generadas++;
          resumen.folios.push(ciclo.folio);
          if (ciclo.saltados > 0) {
            resumen.saltos.push({ nombre: rec.nombre, ciclos: ciclo.saltados });
          }
        }

        // La emisión va DESPUÉS de que la transacción del ciclo haya cerrado:
        // pide números a la DGII y habla con un servicio externo, nada de eso
        // puede vivir dentro de la transacción que crea la factura.
        if (rec.modoEmision === ModoEmision.ECF) {
          const emision = await this.emision.emitir(rec, ciclo.factura);
          if (!emision.ok) {
            await this.registrarError(rec.id, emision.motivo);
            resumen?.emisionesFallidas.push({
              nombre: rec.nombre,
              folio:  ciclo.folio,
              motivo: emision.motivo,
              fase:   emision.fase,
            });
          }
        }

        // El correo va al final y no rompe nada: la factura ya existe y, si
        // lleva comprobante, ya se le declaró a la DGII. Un correo que rebota
        // deja constancia en la factura (emailEstado/emailError) y se reenvía
        // a mano desde ella.
        if (rec.emailCliente && rec.empresaId) {
          const envio = await this.facturaEmail
            .enviar(ciclo.factura.id, rec.empresaId, { automatico: true })
            .catch(e => ({ ok: false, destino: null, error: e?.message, copias: [] }));
          if (!envio.ok && envio.error) {
            resumen?.correosFallidos.push({
              folio:   ciclo.folio,
              destino: envio.destino,
              motivo:  envio.error,
            });
          }
        }
      } catch (err) {
        const motivo = (err as Error).message;
        this.logger.error(`Error generando recurrente #${rec.id}: ${motivo}`);
        await this.registrarError(rec.id, motivo);
        if (resumen) {
          resumen.errores++;
          resumen.fallos.push({ nombre: rec.nombre, motivo });
        }
      }
    }

    await this.notificarResumen(resumenPorEmpresa).catch(e =>
      this.logger.warn(`[Recurrentes] Email resumen falló: ${e?.message}`),
    );
  }

  /** Deja escrito en la plantilla por qué falló el último ciclo. */
  private async registrarError(id: number, motivo: string): Promise<void> {
    await this.recurrenteRepository.update(id, {
      ultimoError:   motivo.substring(0, 2000),
      ultimoErrorAt: new Date(),
    }).catch(() => null);
  }

  private async notificarResumen(
    resumen: Map<number, ResumenEmpresa>,
  ): Promise<void> {
    if (resumen.size === 0) return;

    for (const [empresaId, r] of resumen.entries()) {
      try {
        const [emp] = await this.ds.query<{ configuracion: any; nombre: string }[]>(
          `SELECT configuracion, nombre FROM empresa WHERE id = $1 AND "isActive" = true`,
          [empresaId],
        );
        if (!emp) continue;
        const cfg = (emp.configuracion ?? {}) as Record<string, unknown>;

        const hayProblemas = r.fallos.length > 0
          || r.saltos.length > 0
          || r.emisionesFallidas.length > 0
          || r.correosFallidos.length > 0;

        // La empresa puede apagar el resumen diario, pero no los avisos de que
        // algo salió mal: con e-CF automático, enterarse tarde de que un
        // comprobante no salió cuesta bastante más que un correo de más.
        if (cfg.notifFactRecurrente === false && !hayProblemas) continue;

        const admins = await this.ds.query<{ email: string; nombre: string }[]>(
          `SELECT u.email, u.nombre FROM users u
           JOIN usuario_empresa ue ON ue."userId" = u.id
           WHERE ue."empresaId" = $1 AND ue."isActive" = true
             AND u."isActive" = true AND u.role IN ('admin','contador')
           LIMIT 5`,
          [empresaId],
        );

        // Copia al administrativo. Sale de NOTIF_ADMIN_EMAIL, que es donde ya
        // viven los avisos de e-CF del resto del sistema — nunca de un correo
        // escrito en el código.
        const destinatarios = [...admins.map(a => a.email)];
        const adminGlobal = this.config.get<string>('NOTIF_ADMIN_EMAIL', '').trim();
        if (adminGlobal && hayProblemas && !destinatarios.includes(adminGlobal)) {
          destinatarios.push(adminGlobal);
        }
        if (!destinatarios.length) continue;

        const foliosList = r.folios.length > 5
          ? [...r.folios.slice(0, 5), `... y ${r.folios.length - 5} más`]
          : r.folios;

        const html = `
          <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
            <div style="background:#0F172A;padding:20px 24px;border-radius:10px 10px 0 0">
              <div style="color:#F59E0B;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em">
                🔄 Facturas Recurrentes — ${emp.nombre}
              </div>
            </div>
            <div style="background:#fff;padding:20px 24px;border:1px solid #E2E8F0;border-top:none;border-radius:0 0 10px 10px">
              <p style="margin:0 0 12px;color:#0F172A;font-size:14px">
                El cron diario de hoy generó <strong>${r.generadas} factura(s)</strong>:
              </p>
              <ul style="margin:0 0 12px;padding-left:20px;color:#475569;font-size:13px">
                ${foliosList.map(f => `<li>${f}</li>`).join('')}
              </ul>
              ${r.fallos.length ? `
                <p style="margin:12px 0 4px;color:#DC2626;font-size:13px;font-weight:600">
                  ⚠ ${r.fallos.length} no se pudieron generar:
                </p>
                <ul style="margin:0 0 12px;padding-left:20px;color:#DC2626;font-size:12px">
                  ${r.fallos.map(f => `<li><strong>${f.nombre}</strong>: ${f.motivo}</li>`).join('')}
                </ul>` : ''}
              ${r.emisionesFallidas.length ? `
                <p style="margin:12px 0 4px;color:#DC2626;font-size:13px;font-weight:600">
                  ⚠ ${r.emisionesFallidas.length} factura(s) sin comprobante fiscal:
                </p>
                <ul style="margin:0 0 8px;padding-left:20px;color:#DC2626;font-size:12px">
                  ${r.emisionesFallidas.map(f => `
                    <li>
                      <strong>${f.folio}</strong> (${f.nombre}): ${f.motivo}
                      <br><span style="color:#94A3B8">${f.fase === 'previa'
                        ? 'La factura quedó en BORRADOR y NO se consumió número de secuencia.'
                        : 'El número está emitido y tiene su fila; falló el envío. Reintenta desde la factura.'}</span>
                    </li>`).join('')}
                </ul>` : ''}
              ${r.correosFallidos.length ? `
                <p style="margin:12px 0 4px;color:#B45309;font-size:13px;font-weight:600">
                  ✉ ${r.correosFallidos.length} correo(s) no llegaron al cliente:
                </p>
                <ul style="margin:0 0 8px;padding-left:20px;color:#B45309;font-size:12px">
                  ${r.correosFallidos.map(c => `
                    <li><strong>${c.folio}</strong>${c.destino ? ` → ${c.destino}` : ''}: ${c.motivo}</li>`).join('')}
                </ul>
                <p style="color:#B45309;font-size:11px;margin:0 0 8px">
                  La factura está bien: sólo falló el correo. Se reenvía desde la factura.
                </p>` : ''}
              ${r.saltos.length ? `
                <p style="margin:12px 0 4px;color:#B45309;font-size:13px;font-weight:600">
                  ⏭ Ciclos saltados (el servidor no corrió esos días):
                </p>
                <ul style="margin:0 0 8px;padding-left:20px;color:#B45309;font-size:12px">
                  ${r.saltos.map(s => `<li><strong>${s.nombre}</strong>: ${s.ciclos} ciclo(s). Se generó UNA factura, no ${s.ciclos + 1}.</li>`).join('')}
                </ul>
                <p style="color:#B45309;font-size:11px;margin:0 0 8px">
                  Si las atrasadas hacen falta, hay que emitirlas a mano.
                </p>` : ''}
              <p style="color:#94A3B8;font-size:11px;margin:8px 0 0">Revisa el módulo de Facturas Recurrentes para ver el detalle de cada una.</p>
            </div>
          </div>`;

        const pendientes = r.fallos.length + r.emisionesFallidas.length;
        await this.emailService.enviar({
          to: destinatarios,
          subject: pendientes > 0
            ? `⚠ ${pendientes} recurrente(s) requieren atención — ${emp.nombre}`
            : `🔄 ${r.generadas} factura(s) recurrente(s) generadas — ${emp.nombre}`,
          html,
        });

        this.logger.log(
          `[Recurrentes] Aviso enviado a empresa #${empresaId}: ` +
          `${r.generadas} generadas, ${pendientes} con problemas`,
        );
      } catch (err) {
        this.logger.warn(`[Recurrentes] Error notificando empresa #${empresaId}: ${(err as Error).message}`);
      }
    }
  }

  /**
   * Generar ahora, sin esperar al cron.
   *
   * Pasa por el mismo ciclo transaccional que el cron, así que la guarda de
   * duplicado también aplica aquí: si el cron ya generó esta madrugada, este
   * botón no saca una segunda factura. Antes eran dos caminos distintos y el
   * botón no comprobaba nada.
   */
  async ejecutarAhora(id: number) {
    const rec    = await this.findById(id);
    const hoyISO = fechaHoyRD();

    let ciclo: ResultadoCiclo;
    try {
      ciclo = await this.generacion.ejecutarCiclo(rec, hoyISO, true);
    } catch (err) {
      const motivo = (err as Error).message;
      await this.registrarError(id, motivo);
      throw new BadRequestException(`No se pudo generar la factura: ${motivo}`);
    }

    if (ciclo.estado === 'finalizada') {
      throw new BadRequestException(
        `"${rec.nombre}" ya pasó su fecha de fin (${aFechaISO(rec.fechaFin)}) y quedó pausada.`,
      );
    }
    if (ciclo.estado === 'omitida') {
      throw new BadRequestException(ciclo.motivo);
    }

    this.logger.log(
      `✅ Ejecución manual "${rec.nombre}" → ${ciclo.folio} (próxima: ${ciclo.proxima})`,
    );

    // Mismo camino de emisión que el cron. Si no se puede emitir, la factura
    // queda generada (en borrador, con el motivo) y se devuelve el aviso: la
    // generación no se deshace por un comprobante que no salió.
    let emision: { ok: boolean; motivo?: string; encf?: string | null } | null = null;
    if (rec.modoEmision === ModoEmision.ECF) {
      const r = await this.emision.emitir(rec, ciclo.factura);
      emision = r.ok
        ? { ok: true, encf: r.encf }
        : { ok: false, motivo: r.motivo };
      if (!r.ok) await this.registrarError(id, r.motivo);
    }

    // El correo no deshace nada: si falla, queda registrado en la factura y se
    // reenvía desde ella.
    let envio: { ok: boolean; destino: string | null; error?: string } = {
      ok: false, destino: null,
    };
    if (rec.emailCliente && rec.empresaId) {
      envio = await this.facturaEmail
        .enviar(ciclo.factura.id, rec.empresaId, { automatico: true })
        .catch(e => ({ ok: false, destino: null, error: e?.message }));
    }

    const recurrente = await this.findById(id);
    return Object.assign(recurrente, {
      folio:        ciclo.folio,
      facturaId:    ciclo.factura.id,
      emailEnviado: envio.ok,
      emailDestino: envio.destino,
      emailError:   envio.error ?? null,
      ecfEmitido:   emision ? emision.ok : null,
      ecfNumero:    emision?.encf ?? null,
      ecfError:     emision && !emision.ok ? emision.motivo : null,
    });
  }
}
