import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { ECF, EstadoDGII } from '../entities/ecf.entity';
import { EcfEvento, TipoEcfEvento } from '../entities/ecf-evento.entity';
import { MSellerClientService } from '../services/mseller-client.service';

const MINUTOS_SIN_RESPUESTA = 10;  // esperar 10 min antes de primer intento

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
    const corte = new Date(Date.now() - MINUTOS_SIN_RESPUESTA * 60_000);

    // force=true → consulta TODOS los enviados sin importar antigüedad (admin manual)
    const qb = this.ecfRepo
      .createQueryBuilder('ecf')
      .where('ecf.estadoDGII = :estado', { estado: EstadoDGII.ENVIADO })
      .andWhere('ecf.trackId IS NOT NULL')
      .andWhere('ecf.respuestaDgii IS NULL')
      .andWhere('ecf.isActive = true');

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
