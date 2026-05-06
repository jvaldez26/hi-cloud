import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';

import { ECF, EstadoDGII, DocumentoOrigenTipo } from '../entities/ecf.entity';
import { EcfEvento, TipoEcfEvento } from '../entities/ecf-evento.entity';
import { SecuenciaECF } from '../entities/secuencia-ecf.entity';
import { EmpresaEcfConfig } from '../entities/empresa-ecf-config.entity';
import { Factura } from '../../facturas/entities/factura.entity';

import { ENCFGeneratorService } from '../services/encf-generator.service';
import { ECFBuilderService, ECFBuildInput } from '../services/ecf-builder.service';
import { MSellerClientService } from '../services/mseller-client.service';
import { EcfConfigService } from '../services/ecf-config.service';

import {
  EcfDuplicadoError,
  EcfConfigFaltanteError,
  EcfRncRequeridoError,
  EcfComunicacionError,
  EcfValidacionError,
} from '../errors/ecf.errors';

const TIMEOUT_POS      = 8_000;
const TIMEOUT_REGULAR  = 30_000;

export interface EmitirECFInput {
  empresaId:           number;
  documentoOrigenTipo: DocumentoOrigenTipo;
  documentoOrigenId:   number;
  tipoEcf:             number;   // 31 | 32 | …
  modoSincrono?:       boolean;  // true = POS (timeout 8s)
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

    private readonly generator:  ENCFGeneratorService,
    private readonly builder:    ECFBuilderService,
    private readonly mseller:    MSellerClientService,
    private readonly configSvc:  EcfConfigService,
    private readonly ds:         DataSource,
  ) {}

  async execute(input: EmitirECFInput): Promise<EmitirECFResult> {
    const { empresaId, documentoOrigenTipo, documentoOrigenId, tipoEcf, modoSincrono } = input;
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

    // ── 4. CONSTRUIR PAYLOAD JSON ─────────────────────────────────────────────
    let payload: ReturnType<typeof this.builder.build>;
    try {
      const buildInput: ECFBuildInput = {
        encf,
        factura: factura as Factura,
        config,
        fechaVencSec,
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
    });

    const ecfSaved = await this.ecfRepo.save(ecfRecord);
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

      // En TesteCF MSeller acepta sincrónicamente → marcar como ACEPTADO
      const estadoFinal = EstadoDGII.ENVIADO; // el job de polling actualizará a ACEPTADO
      await this.ecfRepo.update(ecfSaved.id, { estadoDGII: estadoFinal });

      const ecfFinal = await this.ecfRepo.findOne({ where: { id: ecfSaved.id }, relations: ['tipoECF'] });
      this.logger.log(`EmitirECF OK | ${encf} | trackId=${respuesta.internalTrackId}`);
      return this.toResult(ecfFinal!, false);

    } catch (err) {
      // ── Errores de validación MSeller (4xx) → RECHAZADO ──────────────────
      if (err instanceof EcfValidacionError) {
        await this.ecfRepo.update(ecfSaved.id, {
          estadoDGII:    EstadoDGII.RECHAZADO,
          errorEnvio:    err.message,
          intentosEnvio: 1,
          ultimoIntentoEnvio: new Date(),
          respuestaMSeller: { status: err.statusCode, detalle: err.detalle, errores: err.erroresValidacion } as any,
        });
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

      // Error inesperado
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
    // VENTA_POS — placeholder; se poblará en Fase 5 con los datos del ticket POS
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
