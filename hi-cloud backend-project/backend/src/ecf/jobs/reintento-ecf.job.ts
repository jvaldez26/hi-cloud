import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ECF, EstadoDGII, DocumentoOrigenTipo } from '../entities/ecf.entity';
import { EcfEvento, TipoEcfEvento } from '../entities/ecf-evento.entity';
import { SecuenciaECF } from '../entities/secuencia-ecf.entity';
import { Factura } from '../../facturas/entities/factura.entity';
import { NotaDebito } from '../../notas-debito/entities/nota-debito.entity';
import { NotaCredito } from '../../notas-credito/entities/nota-credito.entity';
import { Compra } from '../../compras/entities/compra.entity';
import { Gasto } from '../../gastos/entities/gasto.entity';
import { MSellerClientService } from '../services/mseller-client.service';
import { ECFBuilderService, MSellerInfoReferencia, MSellerPayload } from '../services/ecf-builder.service';
import { EcfConfigService } from '../services/ecf-config.service';
import { EcfValidacionError } from '../errors/ecf.errors';
import { fmtFecha } from '../builders/base-ecf.builder';

const MAX_INTENTOS = 5;

/**
 * Minutos de espera mínima antes de reintentar según el intento anterior.
 * intento 1 → 2 min | 2 → 5 min | 3 → 15 min | 4 → 30 min | 5+ → 60 min
 */
const BACKOFF_MIN = [2, 5, 15, 30, 60];

/**
 * Procesa comprobantes en estado PENDIENTE_ENVIO.
 * Corre cada 2 minutos. No bloquea el event loop — cada empresa se procesa
 * secuencialmente para evitar sobrecargar MSeller.
 *
 * Reconstruye el payload desde la fuente original (documento + config + secuencia)
 * usando el mismo builder que el envío inicial, garantizando un XML con el orden
 * de elementos exigido por el XSD de DGII.
 */
@Injectable()
export class ReintentoECFJob {
  private readonly logger = new Logger(ReintentoECFJob.name);
  private running = false;

  constructor(
    @InjectRepository(ECF)
    private readonly ecfRepo: Repository<ECF>,

    @InjectRepository(EcfEvento)
    private readonly eventoRepo: Repository<EcfEvento>,

    @InjectRepository(SecuenciaECF)
    private readonly secuenciaRepo: Repository<SecuenciaECF>,

    @InjectRepository(Factura)
    private readonly facturaRepo: Repository<Factura>,

    @InjectRepository(NotaDebito)
    private readonly notaDebitoRepo: Repository<NotaDebito>,

    @InjectRepository(NotaCredito)
    private readonly notaCreditoRepo: Repository<NotaCredito>,

    @InjectRepository(Compra)
    private readonly compraRepo: Repository<Compra>,

    @InjectRepository(Gasto)
    private readonly gastoRepo: Repository<Gasto>,

    private readonly mseller:   MSellerClientService,
    private readonly builder:   ECFBuilderService,
    private readonly configSvc: EcfConfigService,
  ) {}

  @Cron('*/2 * * * *', { name: 'reintento-ecf' })
  async run(): Promise<void> {
    if (this.running) {
      this.logger.debug('ReintentoECFJob ya en ejecución, saltando...');
      return;
    }
    this.running = true;
    try {
      await this.procesarPendientes();
    } finally {
      this.running = false;
    }
  }

  /**
   * DESHABILITADO — causaba reenvío masivo no intencional al mover ECFs de
   * CONTINGENCIA → PENDIENTE_ENVIO automáticamente, que luego el cron de
   * reintentos enviaba en bloque a MSeller quemando secuencias.
   * El rescate manual se hace vía POST /ecf/ejecutar-reintentos (admin only).
   *
   * Cron válido mínimo: '0 0 1 1 *' (1 enero a medianoche) + return inmediato.
   */
  @Cron('0 0 1 1 *', { name: 'rescate-contingencia-ecf' })
  async rescatarContingencia(): Promise<void> {
    // DESHABILITADO — no hacer nada para evitar reenvíos masivos accidentales
    return;
    const hace48h = new Date(Date.now() - 48 * 60 * 60_000);

    const enContingencia = await this.ecfRepo.find({
      where: {
        estadoDGII: EstadoDGII.CONTINGENCIA,
        isActive:   true,
      },
      order: { updatedAt: 'ASC' },
      take: 30,
    });

    const candidatos = enContingencia.filter(
      e => new Date(e.updatedAt).getTime() > hace48h.getTime(),
    );

    if (candidatos.length === 0) return;

    this.logger.log(`RescateContingencia: ${candidatos.length} e-CF(s) a reintentar`);

    for (const ecf of candidatos) {
      await this.ecfRepo.update(ecf.id, {
        estadoDGII:         EstadoDGII.PENDIENTE_ENVIO,
        intentosEnvio:      0,
        ultimoIntentoEnvio: undefined,
        errorEnvio:         `Rescate automático desde CONTINGENCIA (${new Date().toISOString()})`,
      });

      await this.logEvento(ecf.id, TipoEcfEvento.REINTENTO, {
        origen: 'rescate-contingencia',
      }, 'Rescatado de CONTINGENCIA → PENDIENTE_ENVIO para reintento automático');

      this.logger.log(`e-CF ${ecf.numero} rescatado de CONTINGENCIA → PENDIENTE_ENVIO`);
    }
  }

  private async procesarPendientes(): Promise<void> {
    const ahora = new Date();

    const pendientes = await this.ecfRepo.find({
      where: { estadoDGII: EstadoDGII.PENDIENTE_ENVIO, isActive: true },
      order: { updatedAt: 'ASC' },
      take: 50,
    });

    if (pendientes.length === 0) return;

    this.logger.log(`ReintentoECF: ${pendientes.length} comprobante(s) pendientes`);

    const bloqueadaCache = new Map<number, boolean>();

    for (const ecf of pendientes) {
      const empId = ecf.empresaId!;

      if (!bloqueadaCache.has(empId)) {
        bloqueadaCache.set(empId, await this.configSvc.isEmpresaBloqueada(empId));
      }
      if (bloqueadaCache.get(empId)) {
        this.logger.debug(
          `e-CF ${ecf.numero} saltado — empresa #${empId} en circuit breaker (cuenta Cognito bloqueada)`,
        );
        continue;
      }

      const intentos      = ecf.intentosEnvio;
      const backoffMinIdx = Math.min(intentos - 1, BACKOFF_MIN.length - 1);
      const minEspera     = BACKOFF_MIN[Math.max(0, backoffMinIdx)] * 60_000;
      const ultimoIntento = ecf.ultimoIntentoEnvio ?? ecf.createdAt;
      const msPasados     = ahora.getTime() - new Date(ultimoIntento).getTime();

      if (msPasados < minEspera) continue;

      await this.procesarUno(ecf);
    }
  }

  /** Público para que el controller de reenvío manual pueda llamarlo directamente. */
  async procesarUno(ecf: ECF): Promise<void> {
    const { id, numero, empresaId, intentosEnvio } = ecf;

    this.logger.log(`Reintentando e-CF ${numero} (intento ${intentosEnvio + 1}/${MAX_INTENTOS})`);

    if (intentosEnvio >= MAX_INTENTOS) {
      await this.ecfRepo.update(id, {
        estadoDGII: EstadoDGII.CONTINGENCIA,
        errorEnvio: `Superó ${MAX_INTENTOS} intentos sin respuesta de MSeller.`,
      });
      await this.logEvento(id, TipoEcfEvento.ESTADO_CAMBIADO, {
        de: EstadoDGII.PENDIENTE_ENVIO, a: EstadoDGII.CONTINGENCIA,
      }, `Máximo de ${MAX_INTENTOS} reintentos alcanzado`);

      this.logger.warn(`e-CF ${numero} → CONTINGENCIA (${MAX_INTENTOS} intentos fallidos)`);
      return;
    }

    try {
      await this.logEvento(id, TipoEcfEvento.REINTENTO, { intento: intentosEnvio + 1 });

      const payload = await this.reconstruirPayload(ecf);

      const respuesta = await this.mseller.enviarDocumento(payload, empresaId!, 30_000);

      let estadoTrasReintento: EstadoDGII = EstadoDGII.ENVIADO;
      try {
        const estadoResp = await this.mseller.consultarEstado(respuesta.internalTrackId, empresaId!);
        const ESTADO_MAP: Record<string, EstadoDGII> = {
          ACEPTADO:   EstadoDGII.ACEPTADO,
          RECHAZADO:  EstadoDGII.RECHAZADO,
          OBSERVADO:  EstadoDGII.OBSERVADO,
          PROCESANDO: EstadoDGII.ENVIADO,
          RECIBIDO:   EstadoDGII.ENVIADO,
        };
        estadoTrasReintento = ESTADO_MAP[estadoResp.status?.toUpperCase()] ?? EstadoDGII.ENVIADO;
      } catch {
        // Si el poll falla, el job de consultar-estado lo recogerá
      }

      const fechaFirmaReintento = parseMSellerSignedDate(respuesta.signedDate);
      await this.ecfRepo.update(id, {
        estadoDGII:         estadoTrasReintento,
        trackId:            respuesta.internalTrackId,
        qrUrl:              respuesta.qr_url,
        codigoSeguridad:    respuesta.securityCode,
        respuestaMSeller:   respuesta as any,
        intentosEnvio:      intentosEnvio + 1,
        ultimoIntentoEnvio: new Date(),
        errorEnvio:         undefined,
        ...(fechaFirmaReintento && { fechaFirma: fechaFirmaReintento }),
        ...(estadoTrasReintento === EstadoDGII.ACEPTADO ? { fechaUso: new Date() } : {}),
      });

      await this.logEvento(id, TipoEcfEvento.ENVIADO, {
        trackId:         respuesta.internalTrackId,
        intento:         intentosEnvio + 1,
        estadoInmediato: estadoTrasReintento,
      });

      this.logger.log(`e-CF ${numero} → ${estadoTrasReintento} (reintento #${intentosEnvio + 1})`);

    } catch (err) {
      const msg    = (err as Error).message;
      const nuevos = intentosEnvio + 1;

      if (err instanceof EcfValidacionError) {
        await this.ecfRepo.update(id, {
          estadoDGII:         EstadoDGII.RECHAZADO,
          intentosEnvio:      nuevos,
          ultimoIntentoEnvio: new Date(),
          errorEnvio:         msg,
        });
        await this.logEvento(id, TipoEcfEvento.ERROR, {
          tipo: 'VALIDACION', intento: nuevos,
        }, msg);
        this.logger.warn(`e-CF ${numero} → RECHAZADO por validación MSeller`);
        return;
      }

      await this.ecfRepo.update(id, {
        intentosEnvio:      nuevos,
        ultimoIntentoEnvio: new Date(),
        errorEnvio:         msg,
      });
      await this.logEvento(id, TipoEcfEvento.ERROR, {
        tipo: 'COMUNICACION', intento: nuevos,
      }, msg);

      this.logger.warn(`e-CF ${numero} reintento #${nuevos} fallido: ${msg}`);
    }
  }

  /**
   * Reconstruye el payload desde la fuente original usando el mismo builder
   * que el envío inicial. Evita leer jsonEnviado de JSONB, que destruye el
   * orden de claves requerido por el XSD de DGII.
   */
  private async reconstruirPayload(ecf: ECF): Promise<MSellerPayload> {
    const { numero, empresaId, documentoOrigenTipo, documentoOrigenId, secuenciaId } = ecf;

    if (!documentoOrigenTipo || !documentoOrigenId) {
      throw new Error(
        `e-CF ${numero} no tiene documentoOrigenTipo/Id — no se puede reconstruir el payload`,
      );
    }

    const tipoNumerico = parseInt(ecf.tipoECF.codigo.replace('E', ''), 10);
    if (isNaN(tipoNumerico)) {
      throw new Error(`e-CF ${numero} tiene código de tipo inválido: ${ecf.tipoECF.codigo}`);
    }

    const [config, secuencia, docOrigen] = await Promise.all([
      this.configSvc.obtenerPorEmpresa(empresaId!),
      this.secuenciaRepo.findOne({ where: { id: secuenciaId } }),
      this.cargarDocumento(documentoOrigenTipo, documentoOrigenId, empresaId!),
    ]);

    // Anclar al mediodía RD (16:00 UTC) igual que el envío original
    const fechaVencSec = (() => {
      if (!secuencia) return new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
      const raw = secuencia.fechaVencimiento;
      const s = raw instanceof Date ? raw.toISOString().substring(0, 10) : String(raw).substring(0, 10);
      const [y, m, d] = s.split('-').map(Number);
      return new Date(Date.UTC(y, m - 1, d, 16));
    })();

    // InfoReferencia para E33/E34 — reconstruida desde los campos guardados en la entidad
    let infoReferencia: MSellerInfoReferencia | undefined;
    if ((tipoNumerico === 33 || tipoNumerico === 34) && ecf.ncfModificado) {
      const ecfOrig = await this.ecfRepo.findOne({
        where: { numero: ecf.ncfModificado, empresaId: empresaId! },
      });
      infoReferencia = {
        NCFModificado:      ecf.ncfModificado,
        FechaNCFModificado: fmtFecha(ecfOrig?.fechaUso ?? ecfOrig?.createdAt ?? new Date()),
        CodigoModificacion: ecf.codigoModificacion ? String(ecf.codigoModificacion) : '3',
      };
    }

    return this.builder.build(tipoNumerico, {
      encf:             numero,
      factura:          docOrigen as Factura,
      config,
      fechaVencSec,
      infoReferencia,
      nombreExtranjero: ecf.razonSocialComprador ?? undefined,
    });
  }

  private async cargarDocumento(
    tipo:      string,
    id:        number,
    empresaId: number,
  ): Promise<Factura | Record<string, unknown>> {
    if (tipo === DocumentoOrigenTipo.FACTURA || tipo === DocumentoOrigenTipo.VENTA_POS) {
      const f = await this.facturaRepo.findOne({
        where:     { id, empresaId },
        relations: ['cliente', 'detalles', 'detalles.producto'],
      });
      if (!f) throw new NotFoundException(`Factura #${id} no encontrada para empresa #${empresaId}`);
      return f;
    }

    if (tipo === DocumentoOrigenTipo.NOTA_DEBITO) {
      const nota = await this.notaDebitoRepo.findOne({
        where:     { id, empresaId },
        relations: ['cliente', 'detalles'],
      });
      if (!nota) throw new NotFoundException(`Nota de Débito #${id} no encontrada para empresa #${empresaId}`);
      return { ...nota, iva: nota.iva } as unknown as Factura;
    }

    if (tipo === DocumentoOrigenTipo.NOTA_CREDITO) {
      const nota = await this.notaCreditoRepo.findOne({
        where:     { id, empresaId },
        relations: ['cliente', 'detalles'],
      });
      if (!nota) throw new NotFoundException(`Nota de Crédito #${id} no encontrada para empresa #${empresaId}`);
      return { ...nota, iva: nota.iva } as unknown as Factura;
    }

    if (tipo === DocumentoOrigenTipo.COMPRA) {
      const compra = await this.compraRepo.findOne({
        where:     { id, empresaId },
        relations: ['proveedor', 'detalles'],
      });
      if (!compra) throw new NotFoundException(`Compra #${id} no encontrada para empresa #${empresaId}`);
      return {
        ...compra,
        cliente: {
          id:          compra.proveedor?.id,
          nombre:      compra.proveedor?.nombre,
          rncReceptor: compra.proveedor?.rnc,
          direccion:   compra.proveedor?.direccion,
        },
        detalles: (compra.detalles ?? []).map(d => ({
          ...d,
          porcentajeIva: (d as any).porcentajeItbis,
          importeIva:    (d as any).importeItbis,
        })),
        iva:      compra.itbis,
        subtotal: compra.subtotal,
        total:    compra.total,
        fecha:    compra.fecha,
      } as unknown as Factura;
    }

    if (tipo === DocumentoOrigenTipo.GASTO) {
      const gasto = await this.gastoRepo.findOne({ where: { id, empresaId } });
      if (!gasto) throw new NotFoundException(`Gasto #${id} no encontrado para empresa #${empresaId}`);
      return {
        fecha:   gasto.fecha,
        cliente: {
          rncReceptor: gasto.rncProveedor ?? undefined,
          nombre:      gasto.proveedor ?? 'Proveedor Informal',
        },
        detalles: [{
          descripcion:    gasto.descripcion,
          cantidad:       1,
          precioUnitario: Number(gasto.monto),
          porcentajeIva:  0,
          importeIva:     0,
          subtotal:       Number(gasto.monto),
        }],
        iva:      gasto.itbis ?? 0,
        subtotal: gasto.monto,
        total:    gasto.total,
      } as unknown as Factura;
    }

    throw new Error(`Tipo de documento origen desconocido para reenvío: ${tipo}`);
  }

  private async logEvento(
    comprobanteId: number,
    evento:        TipoEcfEvento,
    payload?:      Record<string, unknown>,
    mensaje?:      string,
  ): Promise<void> {
    await this.eventoRepo.save(
      this.eventoRepo.create({ comprobanteId, evento, payload, mensaje }),
    );
  }
}

function parseMSellerSignedDate(s: string | undefined): Date | undefined {
  if (!s) return undefined;
  const m = s.match(/^(\d{2})-(\d{2})-(\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/);
  if (!m) return undefined;
  return new Date(`${m[3]}-${m[2]}-${m[1]}T${m[4]}:${m[5]}:${m[6]}-04:00`);
}
