import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { ECF, EstadoDGII } from '../entities/ecf.entity';
import { EcfEvento, TipoEcfEvento } from '../entities/ecf-evento.entity';
import { MSellerClientService } from '../services/mseller-client.service';

const MINUTOS_SIN_RESPUESTA = 10;  // esperar 10 min antes de primer intento

/**
 * Días máximos antes de marcar un ENVIADO como contingencia.
 * MSeller usa webhooks como mecanismo principal de notificación.
 * El polling es fallback para los primeros 3 días. Pasado ese plazo,
 * si no llegó webhook ni respuesta por polling, el comprobante
 * se marca contingencia para no bloquear la cola indefinidamente.
 */
const DIAS_MAX_POLLING = 3;

/** Mapeo de estados MSeller → EstadoDGII interno. */
const MSELLER_ESTADO_MAP: Record<string, EstadoDGII> = {
  ACEPTADO:   EstadoDGII.ACEPTADO,
  RECHAZADO:  EstadoDGII.RECHAZADO,
  OBSERVADO:  EstadoDGII.OBSERVADO,
  PROCESANDO: EstadoDGII.ENVIADO,   // aún procesando, mantener
  RECIBIDO:   EstadoDGII.ENVIADO,   // recibido pero no procesado
};

/**
 * Consulta el estado de comprobantes en ENVIADO sin respuesta definitiva
 * de DGII después de 10 minutos.
 *
 * Corre cada 5 minutos. Si MSeller confirma, actualiza el estado.
 */
@Injectable()
export class ConsultarEstadoECFJob {
  private readonly logger = new Logger(ConsultarEstadoECFJob.name);
  private running = false;

  constructor(
    @InjectRepository(ECF)
    private readonly ecfRepo: Repository<ECF>,

    @InjectRepository(EcfEvento)
    private readonly eventoRepo: Repository<EcfEvento>,

    private readonly mseller: MSellerClientService,
  ) {}

  @Cron('*/5 * * * *', { name: 'consultar-estado-ecf' }) // cada 5 min (antes era cada 1 min)
  async run(force = false): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.consultarPendientes(force);
    } finally {
      this.running = false;
    }
  }

  private async consultarPendientes(force = false): Promise<void> {
    const corte   = new Date(Date.now() - MINUTOS_SIN_RESPUESTA * 60_000);
    const maxAge  = new Date(Date.now() - DIAS_MAX_POLLING * 24 * 60 * 60_000);

    // Paso 1: Marcar como contingencia los comprobantes con más de DIAS_MAX_POLLING días
    //         sin respuesta. MSeller notifica vía webhook; si no llegó en 3 días,
    //         no llegará por polling tampoco.
    const viejos = await this.ecfRepo
      .createQueryBuilder('ecf')
      .where('ecf.estadoDGII = :estado', { estado: EstadoDGII.ENVIADO })
      .andWhere('ecf.trackId IS NOT NULL')
      .andWhere('ecf.respuestaDgii IS NULL')
      .andWhere('ecf.isActive = true')
      .andWhere('ecf.createdAt < :maxAge', { maxAge })
      .getMany();

    if (viejos.length > 0) {
      this.logger.warn(
        `ConsultarEstadoECF: ${viejos.length} comprobante(s) en ENVIADO > ${DIAS_MAX_POLLING} días ` +
        `sin respuesta de MSeller → marcando como contingencia`,
      );
      for (const ecf of viejos) {
        await this.ecfRepo.update(ecf.id, {
          estadoDGII:    EstadoDGII.CONTINGENCIA,
          respuestaDgii: {
            status:  'CONTINGENCIA',
            message: `Sin respuesta de MSeller tras ${DIAS_MAX_POLLING} días. ` +
                     `Verificar estado en portal DGII. TrackId: ${ecf.trackId}`,
          } as any,
        });
        await this.logEvento(ecf.id, TipoEcfEvento.ESTADO_CAMBIADO, {
          de:  EstadoDGII.ENVIADO,
          a:   EstadoDGII.CONTINGENCIA,
          via: 'timeout',
          diasTranscurridos: DIAS_MAX_POLLING,
        }, `Sin respuesta de MSeller tras ${DIAS_MAX_POLLING} días — verificar en portal DGII`);
        this.logger.warn(`e-CF ${ecf.numero} → CONTINGENCIA (timeout ${DIAS_MAX_POLLING}d)`);
      }
    }

    // Paso 2: Consultar por polling los comprobantes recientes (< DIAS_MAX_POLLING días)
    const qb = this.ecfRepo
      .createQueryBuilder('ecf')
      .where('ecf.estadoDGII = :estado', { estado: EstadoDGII.ENVIADO })
      .andWhere('ecf.trackId IS NOT NULL')
      .andWhere('ecf.respuestaDgii IS NULL')
      .andWhere('ecf.isActive = true')
      .andWhere('ecf.createdAt >= :maxAge', { maxAge });  // solo recientes

    if (!force) {
      qb.andWhere('ecf.updatedAt < :corte', { corte });
    }

    const enviados = await qb.take(20).getMany();

    if (enviados.length === 0) return;

    this.logger.log(`ConsultarEstadoECF: ${enviados.length} comprobante(s) a consultar`);

    for (const ecf of enviados) {
      await this.consultarUno(ecf);
    }
  }

  private async consultarUno(ecf: ECF): Promise<void> {
    const { id, numero, trackId, empresaId } = ecf;
    if (!trackId || !empresaId) return;

    try {
      const resp = await this.mseller.consultarEstado(trackId, empresaId);
      const estado = MSELLER_ESTADO_MAP[resp.status?.toUpperCase()] ?? EstadoDGII.ENVIADO;

      if (estado === EstadoDGII.ENVIADO) {
        // DGII aún procesa — nada que hacer, volvemos en el próximo ciclo
        this.logger.debug(`e-CF ${numero} aún procesando (${resp.status})`);
        return;
      }

      // Actualizar estado definitivo
      await this.ecfRepo.update(id, {
        estadoDGII:          estado,
        respuestaDgii:       resp as any,
        fechaUso:            estado === EstadoDGII.ACEPTADO ? new Date() : undefined,
      });

      await this.logEvento(id, TipoEcfEvento.RESPUESTA_RECIBIDA, {
        estadoMSeller: resp.status,
        estadoInterno: estado,
        trackId,
      });

      await this.logEvento(id, TipoEcfEvento.ESTADO_CAMBIADO, {
        de: EstadoDGII.ENVIADO,
        a:  estado,
      }, resp.message);

      this.logger.log(`e-CF ${numero} → ${estado} (DGII respondió vía polling)`);

    } catch (err: any) {
      const msg = (err as Error).message ?? '';
      // 403/401: problema de credenciales MSeller — loguear a nivel debug
      // para no llenar los logs (el job reintentará en el próximo ciclo de 5 min)
      const nivel = msg.includes('403') || msg.includes('401') ? 'debug' : 'warn';
      this.logger[nivel](`Error consultando estado ${numero}: ${msg}`);
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
