import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';

import { ECF, EstadoDGII, DocumentoOrigenTipo } from '../entities/ecf.entity';
import { EcfEvento, TipoEcfEvento } from '../entities/ecf-evento.entity';
import { SecuenciaECF } from '../entities/secuencia-ecf.entity';
import { EmpresaEcfConfig } from '../entities/empresa-ecf-config.entity';
import { Factura } from '../../facturas/entities/factura.entity';
import { NotaDebito } from '../../notas-debito/entities/nota-debito.entity';
import { NotaCredito } from '../../notas-credito/entities/nota-credito.entity';
import { Compra } from '../../compras/entities/compra.entity';
import { Gasto } from '../../gastos/entities/gasto.entity';

import { ENCFGeneratorService } from '../services/encf-generator.service';
import { ECFBuilderService, ECFBuildInput, MSellerInfoReferencia, MSellerPayload } from '../services/ecf-builder.service';
import { MSellerClientService } from '../services/mseller-client.service';
import { EcfConfigService } from '../services/ecf-config.service';

import {
  EcfDuplicadoError,
  EcfConfigFaltanteError,
  EcfRncRequeridoError,
  EcfComunicacionError,
  EcfValidacionError,
  EcfNcfReferenciadoError,
  EcfMontoAnulacionError,
} from '../errors/ecf.errors';

const TIMEOUT_POS      = 8_000;
const TIMEOUT_REGULAR  = 30_000;

function fmtFechaEcf(d: Date | string | undefined): string {
  if (!d) return '';
  const dt = d instanceof Date ? d : new Date(d);
  const dd = String(dt.getDate()).padStart(2, '0');
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  return `${dd}-${mm}-${dt.getFullYear()}`;
}

export interface DatosCompradorECF {
  rnc?:               string;
  cedula?:            string;
  razonSocial?:       string;
  direccion?:         string;
  numeroOrdenCompra?: string;
}

export interface EmitirECFInput {
  empresaId:           number;
  documentoOrigenTipo: DocumentoOrigenTipo;
  documentoOrigenId:   number;
  tipoEcf:             number;   // 31 | 32 | 33 | 34 | 41 | 43 | 44 | 45 | 46 | 47
  modoSincrono?:       boolean;  // true = POS (timeout 8s)
  datosComprador?:     DatosCompradorECF;   // POS: datos capturados en el momento de la venta
  infoReferencia?:     MSellerInfoReferencia;  // E33/E34
  nombreExtranjero?:   string;                 // E46/E47
  paisExtranjero?:     string;                 // E46/E47 — ISO 2 letras
}

export interface EmitirECFResult {
  ecf:          ECF;
  encf:         string;
  qrUrl?:       string;
  trackId?:     string;
  securityCode?: string;
  estado:       EstadoDGII;
  idempotente:  boolean; // true si ya existía un e-CF aceptado
}

/**
 * Caso de uso principal para emitir un e-CF a través de MSeller.
 *
 * Flujo:
 *   1. Idempotencia — devuelve el existente si ya hay uno ACEPTADO.
 *   2. Carga recursos — factura, config MSeller, secuencia activa.
 *   3. Genera eNCF con lock atómico.
 *   4. Construye payload JSON (Strategy por tipo).
 *   5. Crea registro ECF en BD (PENDIENTE_ENVIO).
 *   6. Envía a MSeller (sincrónico o con timeout POS).
 *   7. Actualiza estado según respuesta.
 *   8. Registra eventos de auditoría.
 *   9. Devuelve resultado.
 */
@Injectable()
export class EmitirECFUseCase {
  private readonly logger = new Logger(EmitirECFUseCase.name);

  constructor(
    @InjectRepository(ECF)
    private readonly ecfRepo: Repository<ECF>,

    @InjectRepository(EcfEvento)
    private readonly eventoRepo: Repository<EcfEvento>,

    @InjectRepository(SecuenciaECF)
    private readonly secuenciaRepo: Repository<SecuenciaECF>,

    @InjectRepository(EmpresaEcfConfig)
    private readonly configRepo: Repository<EmpresaEcfConfig>,

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

    private readonly generator:  ENCFGeneratorService,
    private readonly builder:    ECFBuilderService,
    private readonly mseller:    MSellerClientService,
    private readonly configSvc:  EcfConfigService,
    private readonly ds:         DataSource,
  ) {}

  async execute(input: EmitirECFInput): Promise<EmitirECFResult> {
    const {
      empresaId, documentoOrigenTipo, documentoOrigenId, tipoEcf, modoSincrono,
      datosComprador,
      infoReferencia: infoRefInput, nombreExtranjero, paisExtranjero,
    } = input;
    const timeout = modoSincrono ? TIMEOUT_POS : TIMEOUT_REGULAR;

    this.logger.log(
      `EmitirECF inicio | empresa #${empresaId} | ` +
      `${documentoOrigenTipo}#${documentoOrigenId} | tipo E${tipoEcf} | ` +
      `${modoSincrono ? 'SINCRONO (POS)' : 'REGULAR'}`,
    );

    // ── 1. IDEMPOTENCIA ───────────────────────────────────────────────────────
    const existente = await this.ecfRepo.findOne({
      where: { documentoOrigenTipo, documentoOrigenId, empresaId },
      order: { createdAt: 'DESC' },
    });

    if (existente) {
      if (existente.estadoDGII === EstadoDGII.ACEPTADO) {
        this.logger.log(`Idempotencia: ya existe e-CF aceptado ${existente.numero}`);
        return this.toResult(existente, true);
      }
      // RECHAZADO → se permite reintento con nuevo eNCF (continúa flujo normal)
      if ([EstadoDGII.RECHAZADO, EstadoDGII.CONTINGENCIA].includes(existente.estadoDGII)) {
        this.logger.log(
          `Documento ${documentoOrigenTipo}#${documentoOrigenId} tenía e-CF ` +
          `${existente.estadoDGII} (${existente.numero}). Reintentando con nuevo eNCF.`,
        );
      }
    }

    // ── 2. CARGA DE RECURSOS ──────────────────────────────────────────────────
    const [factura, config, secuencia] = await Promise.all([
      this.cargarDocumentoOrigen(documentoOrigenTipo, documentoOrigenId, empresaId),
      this.configRepo.findOne({ where: { empresaId, activo: true } }),
      this.secuenciaRepo.findOne({
        where: { empresaId, isActiva: true, isAgotada: false },
        relations: ['tipoECF'],
        order: { createdAt: 'DESC' },
      }),
    ]);

    // Merge datos del comprador capturados en POS (sobrescriben al cliente guardado)
    if (datosComprador) {
      const f = factura as any;
      f.cliente = {
        ...(f.cliente ?? {}),
        ...(datosComprador.rnc         ? { rncReceptor: datosComprador.rnc }          : {}),
        ...(datosComprador.razonSocial ? { nombre:      datosComprador.razonSocial }   : {}),
        ...(datosComprador.direccion   ? { direccion:   datosComprador.direccion }     : {}),
        ...(datosComprador.numeroOrdenCompra ? { numeroOrdenCompra: datosComprador.numeroOrdenCompra } : {}),
      };
    }

    if (!config) throw new EcfConfigFaltanteError(empresaId);
    if (!config.rncEmisor || !config.razonSocialEmisor) {
      throw new BadRequestException(
        `La configuración e-CF de empresa #${empresaId} no tiene RNC o Razón Social del emisor.`,
      );
    }

    // Obtener la fecha de vencimiento de la secuencia activa para ese tipo
    const secParaTipo = await this.secuenciaRepo
      .createQueryBuilder('s')
      .innerJoinAndSelect('s.tipoECF', 'tipo')
      .where('s.empresaId = :e', { e: empresaId })
      .andWhere('tipo.codigo = :codigo', { codigo: `E${String(tipoEcf).padStart(2, '0')}` })
      .andWhere('s.isActiva = true')
      .andWhere('s.isAgotada = false')
      .getOne();

    const fechaVencSec = secParaTipo
      ? new Date(secParaTipo.fechaVencimiento)
      : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

    // ── 3. GENERAR eNCF (TRANSACCIÓN ATÓMICA) ────────────────────────────────
    const encf = await this.generator.generateNext(empresaId, tipoEcf);
    this.logger.log(`eNCF generado: ${encf}`);

    // ── 4. RESOLVER infoReferencia para E33/E34 ──────────────────────────────
    let infoReferencia = infoRefInput;
    if ((tipoEcf === 33 || tipoEcf === 34) && !infoReferencia) {
      // Auto-resolver desde la nota: busca el ECF aceptado de la factura original
      const nota = factura as unknown as (NotaDebito | NotaCredito);
      const facturaOrigId = (nota as any).facturaOriginalId as number | undefined;
      if (!facturaOrigId) {
        throw new BadRequestException(
          `La nota #${documentoOrigenId} no tiene factura original asociada. ` +
          `Proporcione infoReferencia manualmente.`,
        );
      }
      const ecfOriginal = await this.ecfRepo.findOne({
        where: { facturaId: facturaOrigId, estadoDGII: EstadoDGII.ACEPTADO, empresaId },
        order: { createdAt: 'DESC' },
      });
      if (!ecfOriginal) throw new EcfNcfReferenciadoError(facturaOrigId);

      const facturaOrig = await this.facturaRepo.findOne({ where: { id: facturaOrigId, empresaId } });

      // Validación E34 código 1 (anulación total): monto debe coincidir
      if (tipoEcf === 34 && (infoRefInput?.CodigoModificacion === '1' || !infoRefInput)) {
        const montoNota = Number((nota as any).total);
        const montoOrig = Number(facturaOrig?.total ?? ecfOriginal.montoTotal ?? 0);
        if (montoNota > montoOrig) {
          throw new BadRequestException(
            `El monto de la nota de crédito (${montoNota}) no puede superar el monto original (${montoOrig}).`,
          );
        }
      }

      infoReferencia = {
        NCFModificado:      ecfOriginal.numero,
        FechaNCFModificado: fmtFechaEcf(ecfOriginal.fechaUso ?? ecfOriginal.createdAt),
        // E33: "3" = corrección de montos (debit note). E34: "3" por defecto; caller puede overridear vía infoRefInput
        CodigoModificacion: '3',
      };
    }

    // ── 5. CONSTRUIR PAYLOAD JSON ─────────────────────────────────────────────
    let payload: MSellerPayload;
    try {
      const buildInput: ECFBuildInput = {
        encf,
        factura:           factura as Factura,
        config,
        fechaVencSec,
        infoReferencia,
        nombreExtranjero,
        paisExtranjero,
      };
      payload = this.builder.build(tipoEcf, buildInput);
    } catch (err) {
      if (err instanceof EcfRncRequeridoError) throw err;
      throw err;
    }

    // ── 5. CREAR REGISTRO ECF EN BD ───────────────────────────────────────────
    const tipoEcfEntity = secParaTipo?.tipoECF
      ?? await this.ds.getRepository('tipos_ecf').findOne({ where: { codigo: `E${String(tipoEcf).padStart(2,'0')}` } }) as any;

    const { subtotal, iva, total } = factura as Factura;
    const montoGravado = Number(subtotal);
    const montoItbis   = Number(iva);
    const montoTotal   = Number(total);

    const ecfRecord = this.ecfRepo.create({
      empresaId,
      numero:              encf,
      tipoECFId:           tipoEcfEntity?.id ?? 0,
      secuenciaId:         secParaTipo?.id ?? 0,
      facturaId:           documentoOrigenTipo === DocumentoOrigenTipo.FACTURA ? documentoOrigenId : undefined,
      documentoOrigenTipo,
      documentoOrigenId,
      estadoDGII:          EstadoDGII.PENDIENTE_ENVIO,
      codigoSeguridad:     String(Math.floor(100000 + Math.random() * 900000)),
      rncComprador:        (factura as Factura).cliente?.rncReceptor ?? undefined,
      razonSocialComprador: (factura as Factura).cliente?.nombre,
      direccionComprador:  (factura as Factura).cliente?.direccion ?? undefined,
      montoExento:         0,
      montoGravado,
      montoItbis,
      montoTotal,
      jsonEnviado:         payload as unknown as Record<string, unknown>,
      intentosEnvio:       0,
      // Campos específicos por tipo
      ...(infoReferencia ? {
        ncfModificado:      infoReferencia.NCFModificado,
        codigoModificacion: infoReferencia.CodigoModificacion,
      } : {}),
    } as any);

    const ecfSaved = await this.ecfRepo.save(ecfRecord) as unknown as ECF;
    await this.registrarEvento(ecfSaved.id, TipoEcfEvento.CREADO, {
      encf, tipoEcf, documentoOrigenTipo, documentoOrigenId,
    });

    // ── 6. ENVIAR A MSELLER ───────────────────────────────────────────────────
    try {
      const t0 = Date.now();
      const respuesta = await this.mseller.enviarDocumento(payload, empresaId, timeout);
      const latencia  = Date.now() - t0;

      // ── 7. ACTUALIZAR ESTADO → ACEPTADO (MSeller recibió el documento) ────
      await this.ecfRepo.update(ecfSaved.id, {
        estadoDGII:         EstadoDGII.ENVIADO,
        trackId:            respuesta.internalTrackId,
        qrUrl:              respuesta.qr_url,
        codigoSeguridad:    respuesta.securityCode,
        respuestaMSeller:   respuesta as any,
        intentosEnvio:      1,
        ultimoIntentoEnvio: new Date(),
      } as any);

      await this.registrarEvento(ecfSaved.id, TipoEcfEvento.ENVIADO, {
        trackId:      respuesta.internalTrackId,
        latenciaMs:   latencia,
        securityCode: respuesta.securityCode,
      });

      // ── Poll inmediato: MSeller suele confirmar en segundos ───────────────
      // En lugar de esperar al cron job (5 min + 10 min = hasta 15 min),
      // consultamos el estado justo después de enviar.
      let estadoFinal: EstadoDGII = EstadoDGII.ENVIADO;
      try {
        const estadoResp = await this.mseller.consultarEstado(
          respuesta.internalTrackId,
          empresaId,
        );
        const ESTADO_MAP: Record<string, EstadoDGII> = {
          ACEPTADO:   EstadoDGII.ACEPTADO,
          RECHAZADO:  EstadoDGII.RECHAZADO,
          OBSERVADO:  EstadoDGII.OBSERVADO,
          PROCESANDO: EstadoDGII.ENVIADO,
          RECIBIDO:   EstadoDGII.ENVIADO,
        };
        estadoFinal = ESTADO_MAP[estadoResp.status?.toUpperCase()] ?? EstadoDGII.ENVIADO;
        this.logger.log(`Poll inmediato ${encf}: MSeller → ${estadoResp.status} → ${estadoFinal}`);
      } catch (pollErr) {
        // Si el poll falla no es crítico — el cron job lo recogerá
        this.logger.warn(`Poll inmediato falló para ${encf}: ${(pollErr as Error).message}`);
      }

      await this.ecfRepo.update(ecfSaved.id, {
        estadoDGII: estadoFinal,
        ...(estadoFinal === EstadoDGII.ACEPTADO ? { fechaUso: new Date() } : {}),
      });

      const ecfFinal = await this.ecfRepo.findOne({ where: { id: ecfSaved.id }, relations: ['tipoECF'] });
      this.logger.log(`EmitirECF OK | ${encf} | trackId=${respuesta.internalTrackId} | estado=${estadoFinal}`);
      return this.toResult(ecfFinal!, false);

    } catch (err) {
      // ── Errores de validación MSeller (4xx) → RECHAZADO ──────────────────
      if (err instanceof EcfValidacionError) {
        // Guardamos el JSON enviado en el campo `xml` para diagnóstico.
        // Cuando MSeller rechaza en 4xx nunca genera XML firmado, así que
        // usamos este campo para mostrar información útil en "Ver XML".
        const xmlDiag = `<!-- e-CF RECHAZADO POR MSELLER [${(err as any).statusCode}]
   Motivo: ${(err as any).detalle}
   Fecha: ${new Date().toISOString()}
-->
<!-- JSON enviado a MSeller (para diagnóstico): -->
${JSON.stringify(payload, null, 2)}`;

        await this.ecfRepo.update(ecfSaved.id, {
          estadoDGII:    EstadoDGII.RECHAZADO,
          errorEnvio:    err.message,
          xml:           xmlDiag,
          intentosEnvio: 1,
          ultimoIntentoEnvio: new Date(),
          respuestaMSeller: { status: (err as any).statusCode, detalle: (err as any).detalle, errores: (err as any).erroresValidacion } as any,
        } as any);
        await this.registrarEvento(ecfSaved.id, TipoEcfEvento.ERROR, {
          tipo: 'VALIDACION', statusCode: err.statusCode, detalle: err.detalle,
        }, err.message);
        throw err;
      }

      // ── Timeout / error de red → PENDIENTE_ENVIO para que el job reintente
      if (err instanceof EcfComunicacionError) {
        await this.ecfRepo.update(ecfSaved.id, {
          estadoDGII:    EstadoDGII.PENDIENTE_ENVIO,
          errorEnvio:    err.message,
          intentosEnvio: 1,
          ultimoIntentoEnvio: new Date(),
        });
        await this.registrarEvento(ecfSaved.id, TipoEcfEvento.ERROR, {
          tipo: 'COMUNICACION',
        }, err.message);

        // En modo POS devolvemos el comprobante en PENDIENTE — la venta sí se completa
        if (modoSincrono) {
          const ecfPendiente = await this.ecfRepo.findOne({ where: { id: ecfSaved.id }, relations: ['tipoECF'] });
          this.logger.warn(`POS: e-CF en PENDIENTE_ENVIO (MSeller no disponible). eNCF=${encf}`);
          return this.toResult(ecfPendiente!, false);
        }
        throw err;
      }

      // Error inesperado — loggear siempre como ERROR (nunca silencioso)
      this.logger.error(
        `[ECF] Error inesperado para ${encf} [${(err as any)?.constructor?.name}]: ${(err as Error).message}`,
        (err as Error).stack,
      );
      await this.ecfRepo.update(ecfSaved.id, {
        estadoDGII: EstadoDGII.PENDIENTE_ENVIO,
        errorEnvio: (err as Error).message,
        intentosEnvio: 1,
        ultimoIntentoEnvio: new Date(),
      });
      throw err;
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private async cargarDocumentoOrigen(
    tipo: DocumentoOrigenTipo,
    id:   number,
    empresaId: number,
  ): Promise<Factura | Record<string, unknown>> {
    if (tipo === DocumentoOrigenTipo.FACTURA) {
      const f = await this.facturaRepo.findOne({
        where: { id, empresaId },
        relations: ['cliente', 'detalles', 'detalles.producto'],
      });
      if (!f) throw new NotFoundException(`Factura #${id} no encontrada para empresa #${empresaId}`);
      return f;
    }

    if (tipo === DocumentoOrigenTipo.NOTA_DEBITO) {
      const nota = await this.notaDebitoRepo.findOne({
        where: { id, empresaId },
        relations: ['cliente', 'detalles'],
      });
      if (!nota) throw new NotFoundException(`Nota de Débito #${id} no encontrada para empresa #${empresaId}`);
      // Adaptar NotaDebito → forma compatible con Factura (iva→importeIva ya lo maneja buildItemsFromDetalles)
      return {
        ...nota,
        // Exponer iva como campo estándar
        iva: nota.iva,
      } as unknown as Factura;
    }

    if (tipo === DocumentoOrigenTipo.NOTA_CREDITO) {
      const nota = await this.notaCreditoRepo.findOne({
        where: { id, empresaId },
        relations: ['cliente', 'detalles'],
      });
      if (!nota) throw new NotFoundException(`Nota de Crédito #${id} no encontrada para empresa #${empresaId}`);
      return {
        ...nota,
        iva: nota.iva,
      } as unknown as Factura;
    }

    if (tipo === DocumentoOrigenTipo.COMPRA) {
      const compra = await this.compraRepo.findOne({
        where: { id, empresaId },
        relations: ['proveedor', 'detalles'],
      });
      if (!compra) throw new NotFoundException(`Compra #${id} no encontrada para empresa #${empresaId}`);

      // Adaptar Compra → forma compatible con Factura
      // Proveedor → posición de "cliente" para que el builder lo use como Comprador
      // porcentajeItbis/importeItbis → porcentajeIva/importeIva
      return {
        ...compra,
        cliente: {
          id:          compra.proveedor?.id,
          nombre:      compra.proveedor?.nombre,
          rncReceptor: compra.proveedor?.rnc,   // Proveedor.rnc → rncReceptor
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

      // Gastos menores: sin array de detalles → crear ítem sintético exento
      return {
        fecha:    gasto.fecha,
        cliente: {
          rncReceptor: gasto.rncProveedor ?? undefined,
          nombre:      gasto.proveedor ?? 'Proveedor Informal',
        },
        detalles: [{
          descripcion:    gasto.descripcion,
          cantidad:       1,
          precioUnitario: Number(gasto.monto),
          porcentajeIva:  0,   // gastos menores: exento
          importeIva:     0,
          subtotal:       Number(gasto.monto),
        }],
        iva:      gasto.itbis ?? 0,
        subtotal: gasto.monto,
        total:    gasto.total,
      } as unknown as Factura;
    }

    // VENTA_POS — placeholder; se poblará con los datos del ticket POS
    return {
      id,
      total: 0,
      subtotal: 0,
      iva: 0,
      cliente: null,
      detalles: [],
      fecha: new Date(),
    };
  }

  private async registrarEvento(
    comprobanteId: number,
    evento:        TipoEcfEvento,
    payload?:      Record<string, unknown>,
    mensaje?:      string,
  ): Promise<void> {
    await this.eventoRepo.save(
      this.eventoRepo.create({ comprobanteId, evento, payload, mensaje }),
    );
  }

  private toResult(ecf: ECF, idempotente: boolean): EmitirECFResult {
    return {
      ecf,
      encf:         ecf.numero,
      qrUrl:        ecf.qrUrl,
      trackId:      ecf.trackId,
      securityCode: (ecf.respuestaMSeller as any)?.securityCode,
      estado:       ecf.estadoDGII,
      idempotente,
    };
  }
}
