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

    for (const ecf of pendientes) {
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

  private async procesarUno(ecf: ECF): Promise<void> {
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

      const respuesta = await this.mseller.enviarDocumento(
        jsonEnviado as any,
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
