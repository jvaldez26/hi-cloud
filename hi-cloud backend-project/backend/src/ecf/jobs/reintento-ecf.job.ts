import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { ECF, EstadoDGII } from '../entities/ecf.entity';
import { EcfEvento, TipoEcfEvento } from '../entities/ecf-evento.entity';
import { MSellerClientService } from '../services/mseller-client.service';
import { ECFBuilderService, ECFBuildInput } from '../services/ecf-builder.service';
import { EcfConfigService } from '../services/ecf-config.service';
import { EcfValidacionError, EcfComunicacionError } from '../errors/ecf.errors';

/** Orden canónico de campos del Emisor según XSD DGII — FechaEmision siempre al final. */
const EMISOR_CANON = [
  'RNCEmisor', 'RazonSocialEmisor', 'NombreComercial', 'Sucursal',
  'DireccionEmisor', 'Municipio', 'Provincia', 'Telefono', 'CorreoEmisor',
  'ActividadEconomica', 'FechaEmision',
] as const;

/**
 * Orden canónico de campos del Encabezado según XSD DGII.
 * PostgreSQL JSONB no preserva el orden de inserción; al leer el jsonEnviado
 * los campos vuelven en orden alfabético (Comprador, Emisor, IdDoc, Totales, Version…).
 * DGII exige Version primero, lo que hace fallar la validación del XML.
 */
const ENCABEZADO_CANON = [
  'Version', 'IdDoc', 'Emisor', 'Comprador', 'Totales', 'OtraMoneda',
] as const;

const MAX_INTENTOS = 5;

/**
 * Minutos de espera mínima antes de reintentar según el intento anterior.
 * intento 1 → 2 min | 2 → 5 min | 3 → 15 min | 4 → 30 min | 5+ → 60 min
 */
const BACKOFF_MIN = [2, 5, 15, 30, 60];

/**
 * Procesa comprobantes en estado PENDIENTE_ENVIO.
 * Corre cada 5 minutos. No bloquea el event loop — cada empresa se procesa
 * secuencialmente para evitar sobrecargar MSeller.
 */
@Injectable()
export class ReintentoECFJob {
  private readonly logger = new Logger(ReintentoECFJob.name);
  private running = false; // evitar solapamiento de ejecuciones

  constructor(
    @InjectRepository(ECF)
    private readonly ecfRepo: Repository<ECF>,

    @InjectRepository(EcfEvento)
    private readonly eventoRepo: Repository<EcfEvento>,

    private readonly mseller:    MSellerClientService,
    private readonly builder:    ECFBuilderService,
    private readonly configSvc:  EcfConfigService,
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

    // Buscar comprobantes pendientes cuya ventana de reintento ya pasó
    const pendientes = await this.ecfRepo.find({
      where: { estadoDGII: EstadoDGII.PENDIENTE_ENVIO, isActive: true },
      order: { updatedAt: 'ASC' },
      take: 50, // máx. 50 por ciclo
    });

    if (pendientes.length === 0) return;

    this.logger.log(`ReintentoECF: ${pendientes.length} comprobante(s) pendientes`);

    // Cache local de circuit breaker por empresa — evita N queries a BD por ciclo
    const bloqueadaCache = new Map<number, boolean>();

    for (const ecf of pendientes) {
      const empId = ecf.empresaId!;

      // Verificar circuit breaker (consulta BD solo la primera vez por empresa)
      if (!bloqueadaCache.has(empId)) {
        bloqueadaCache.set(empId, await this.configSvc.isEmpresaBloqueada(empId));
      }
      if (bloqueadaCache.get(empId)) {
        this.logger.debug(
          `e-CF ${ecf.numero} saltado — empresa #${empId} en circuit breaker (cuenta Cognito bloqueada)`,
        );
        continue;
      }

      // Calcular si ya pasó el tiempo de backoff
      const intentos      = ecf.intentosEnvio;
      const backoffMinIdx = Math.min(intentos - 1, BACKOFF_MIN.length - 1);
      const minEspera     = BACKOFF_MIN[Math.max(0, backoffMinIdx)] * 60_000;
      const ultimoIntento = ecf.ultimoIntentoEnvio ?? ecf.createdAt;
      const msPasados     = ahora.getTime() - new Date(ultimoIntento).getTime();

      if (msPasados < minEspera) continue; // aún no es momento

      await this.procesarUno(ecf);
    }
  }

  /** Público para que el controller de reenvío manual pueda llamarlo directamente. */
  async procesarUno(ecf: ECF): Promise<void> {
    const { id, numero, empresaId, intentosEnvio, jsonEnviado } = ecf;

    this.logger.log(`Reintentando e-CF ${numero} (intento ${intentosEnvio + 1}/${MAX_INTENTOS})`);

    // Si superó el máximo → CONTINGENCIA
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
      if (!jsonEnviado) {
        throw new Error(`e-CF ${numero} no tiene jsonEnviado — no se puede reintentar`);
      }

      await this.logEvento(id, TipoEcfEvento.REINTENTO, {
        intento: intentosEnvio + 1,
      });

      // Normalizar el payload recuperado de BD para garantizar FechaEmision al final.
      // Payloads creados antes del fix pueden tener el Emisor en orden incorrecto.
      const payloadNormalizado = this.normalizarEmisorPayload(jsonEnviado as any);

      const respuesta = await this.mseller.enviarDocumento(
        payloadNormalizado,
        empresaId!,
        30_000,
      );

      // Poll inmediato tras el reenvío exitoso
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

      await this.ecfRepo.update(id, {
        estadoDGII:         estadoTrasReintento,
        trackId:            respuesta.internalTrackId,
        qrUrl:              respuesta.qr_url,
        codigoSeguridad:    respuesta.securityCode,
        respuestaMSeller:   respuesta as any,
        intentosEnvio:      intentosEnvio + 1,
        ultimoIntentoEnvio: new Date(),
        errorEnvio:         undefined,
        ...(estadoTrasReintento === EstadoDGII.ACEPTADO ? { fechaUso: new Date() } : {}),
      });

      await this.logEvento(id, TipoEcfEvento.ENVIADO, {
        trackId:      respuesta.internalTrackId,
        intento:      intentosEnvio + 1,
        estadoInmediato: estadoTrasReintento,
      });

      this.logger.log(`e-CF ${numero} → ${estadoTrasReintento} (reintento #${intentosEnvio + 1})`);

    } catch (err) {
      const msg    = (err as Error).message;
      const nuevos = intentosEnvio + 1;

      if (err instanceof EcfValidacionError) {
        // Error de datos → no tiene sentido reintentar, marcar como RECHAZADO
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

      // Error de comunicación → actualizar contador y esperar próximo ciclo
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
   * Reordena Encabezado y Emisor del payload almacenado en BD para respetar
   * el orden del XSD DGII.
   * PostgreSQL JSONB no preserva el orden de inserción, por lo que las claves
   * pueden volver en orden alfabético (IdDoc antes que Version, etc.).
   * DGII valida el XML contra el XSD con orden estricto.
   */
  private normalizarEmisorPayload(payload: any): any {
    try {
      const encabezadoOrig = payload?.ECF?.Encabezado;
      if (!encabezadoOrig || typeof encabezadoOrig !== 'object') return payload;

      // ── 1. Normalizar orden de Encabezado (Version siempre primero) ──────────
      const encabezado: Record<string, unknown> = {};
      for (const key of ENCABEZADO_CANON) {
        const v = encabezadoOrig[key];
        if (v !== undefined && v !== null) encabezado[key] = v;
      }
      // Preservar campos no canónicos al final (futuras extensiones DGII)
      for (const key of Object.keys(encabezadoOrig)) {
        if (!(ENCABEZADO_CANON as readonly string[]).includes(key)) {
          encabezado[key] = encabezadoOrig[key];
        }
      }
      // Asegurar Version presente (payloads muy antiguos podrían no tenerla)
      if (!encabezado['Version']) encabezado['Version'] = '1.0';

      // ── 2. Normalizar orden de Emisor (FechaEmision al final) ─────────────────
      const emisorOrig = encabezadoOrig['Emisor'];
      if (emisorOrig && typeof emisorOrig === 'object') {
        const emisor: Record<string, unknown> = {};
        for (const key of EMISOR_CANON) {
          const v = (emisorOrig as any)[key];
          if (v !== undefined && v !== null && v !== '') emisor[key] = v;
        }
        for (const key of Object.keys(emisorOrig as object)) {
          if (!(EMISOR_CANON as readonly string[]).includes(key)) emisor[key] = (emisorOrig as any)[key];
        }
        encabezado['Emisor'] = emisor;
      }

      return {
        ...payload,
        ECF: { ...payload.ECF, Encabezado: encabezado },
      };
    } catch {
      // Si algo falla, usar payload original (assertEmisorOrder lo detectará)
      return payload;
    }
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
