import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ECF, EstadoDGII } from '../entities/ecf.entity';
import { EcfEvento, TipoEcfEvento } from '../entities/ecf-evento.entity';
import { MSellerClientService } from '../services/mseller-client.service';
import { EcfEfectosNcService } from '../services/ecf-efectos-nc.service';

const MINUTOS_SIN_RESPUESTA = 2;   // esperar 2 min antes de primer intento

/**
 * Días máximos antes de marcar un ENVIADO como contingencia.
 * MSeller usa webhooks como mecanismo principal de notificación.
 * El polling es fallback para los primeros 3 días. Pasado ese plazo,
 * si no llegó webhook ni respuesta por polling, el comprobante
 * se marca contingencia para no bloquear la cola indefinidamente.
 */
const DIAS_MAX_POLLING = 3;

/**
 * Mapeo de estados MSeller → EstadoDGII interno.
 * Batch usa texto con capitalización mixta: "Aceptado", "Rechazado", etc.
 * GET individual devuelve mayúsculas: "ACEPTADO". Se normaliza a UPPER antes de mapear.
 */
const MSELLER_ESTADO_MAP: Record<string, EstadoDGII> = {
  // Respuestas definitivas (batch y GET)
  'ACEPTADO':             EstadoDGII.ACEPTADO,
  'RECHAZADO':            EstadoDGII.RECHAZADO,
  'OBSERVADO':            EstadoDGII.OBSERVADO,
  'ACEPTADO CONDICIONAL': EstadoDGII.OBSERVADO,   // mapea a OBSERVADO (condicional)
  // Respuestas en tránsito (mantener como ENVIADO)
  'PROCESANDO':           EstadoDGII.ENVIADO,
  'RECIBIDO':             EstadoDGII.ENVIADO,
  'ENVIADO':              EstadoDGII.ENVIADO,
  'EN PROCESO':           EstadoDGII.ENVIADO,
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
    private readonly efectosNc: EcfEfectosNcService,
  ) {}

  @Cron('*/2 * * * *', { name: 'consultar-estado-ecf' }) // cada 2 min
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

    // Paso 1: Marcar como contingencia los comprobantes > DIAS_MAX_POLLING días sin respuesta
    const viejos = await this.ecfRepo
      .createQueryBuilder('ecf')
      .where('ecf.estadoDGII = :estado', { estado: EstadoDGII.ENVIADO })
      .andWhere('ecf.isActive = true')
      .andWhere('ecf.createdAt < :maxAge', { maxAge })
      .getMany();

    for (const ecf of viejos) {
      await this.ecfRepo.update(ecf.id, {
        estadoDGII:    EstadoDGII.CONTINGENCIA,
        respuestaDgii: {
          status:  'CONTINGENCIA',
          message: `Sin respuesta de MSeller tras ${DIAS_MAX_POLLING} días. ` +
                   `Verificar estado en portal DGII.`,
        } as any,
      });
      await this.logEvento(ecf.id, TipoEcfEvento.ESTADO_CAMBIADO, {
        de: EstadoDGII.ENVIADO, a: EstadoDGII.CONTINGENCIA, via: 'timeout',
      }, `Sin respuesta de MSeller tras ${DIAS_MAX_POLLING} días`);
      this.logger.warn(`e-CF ${ecf.numero} → CONTINGENCIA (timeout ${DIAS_MAX_POLLING}d)`);

      // Si es NC de anulación total, liberar anulacionPendiente de la factura
      // para no bloquearla indefinidamente mientras se verifica en portal DGII
      this.efectosNc.aplicarEfectosPorEstado(ecf, EstadoDGII.CONTINGENCIA).catch(err =>
        this.logger.error(
          `[ConsultarEstado] Error liberando anulacionPendiente para NC ${ecf.numero}: ${(err as Error).message}`,
        ),
      );
    }
    if (viejos.length > 0) {
      this.logger.warn(`${viejos.length} comprobante(s) → CONTINGENCIA por timeout`);
    }

    // Paso 2: Consultar via batch los comprobantes ENVIADOS recientes
    const qb = this.ecfRepo
      .createQueryBuilder('ecf')
      .where('ecf.estadoDGII = :estado', { estado: EstadoDGII.ENVIADO })
      .andWhere('ecf.isActive = true')
      .andWhere('ecf.createdAt >= :maxAge', { maxAge });

    if (!force) {
      qb.andWhere('ecf.updatedAt < :corte', { corte });
    }

    const enviados = await qb.take(50).getMany();
    if (enviados.length === 0) return;

    this.logger.log(`ConsultarEstadoECF: ${enviados.length} comprobante(s) a consultar (batch)`);

    // Agrupar por empresa y consultar en batches de 50
    const porEmpresa = new Map<number, ECF[]>();
    for (const ecf of enviados) {
      if (!ecf.empresaId) continue;
      if (!porEmpresa.has(ecf.empresaId)) porEmpresa.set(ecf.empresaId, []);
      porEmpresa.get(ecf.empresaId)!.push(ecf);
    }

    for (const [empresaId, ecfs] of porEmpresa) {
      await this.consultarBatch(ecfs, empresaId);
    }
  }

  /** Consulta y actualiza el estado de un único e-CF por número (para uso desde el controller). */
  async consultarUno(ecf: ECF): Promise<void> {
    if (!ecf.empresaId) return;
    await this.consultarBatch([ecf], ecf.empresaId);
  }

  private async consultarBatch(ecfs: ECF[], empresaId: number): Promise<void> {
    const numeros = ecfs.map(e => e.numero);
    let response: Awaited<ReturnType<MSellerClientService['consultarBatch']>>;

    try {
      response = await this.mseller.consultarBatch(numeros, empresaId);
    } catch (err: any) {
      this.logger.warn(`consultarBatch empresaId=${empresaId}: ${(err as Error).message}`);
      return;
    }

    const ecfMap = new Map(ecfs.map(e => [e.numero, e]));

    for (const resultado of response.results ?? []) {
      this.logger.debug(
        `[batch] ecf=${resultado.ecf} status="${resultado.status}" found=${resultado.found}`,
      );

      if (!resultado.found) {
        this.logger.warn(`e-CF no encontrado en MSeller: ${resultado.ecf}`);
        continue;
      }

      const ecf = ecfMap.get(resultado.ecf);
      if (!ecf) {
        this.logger.warn(`e-CF ${resultado.ecf} no encontrado en BD local`);
        continue;
      }

      const estadoKey = resultado.status?.toUpperCase() ?? '';
      let nuevoEstado: EstadoDGII | undefined = MSELLER_ESTADO_MAP[estadoKey];

      // Batch devuelve "Error" → intentar consulta individual por trackId antes de decidir
      if (estadoKey === 'ERROR') {
        this.logger.warn(
          `e-CF ${resultado.ecf} status="Error" batch — data: ${JSON.stringify(resultado.data)}`,
        );
        if (ecf.trackId) {
          try {
            const ind    = await this.mseller.consultarEstado(ecf.trackId, empresaId);
            const indKey = ind.status?.toUpperCase() ?? '';
            nuevoEstado  = MSELLER_ESTADO_MAP[indKey];
            this.logger.log(
              `e-CF ${resultado.ecf} consulta individual: "${ind.status}" → ${nuevoEstado ?? 'sin mapeo'}`,
            );
          } catch (indErr: any) {
            this.logger.warn(
              `e-CF ${resultado.ecf} consulta individual fallida: ${(indErr as Error).message}`,
            );
          }
        }
        // Si aún sin estado definitivo → RECHAZADO (conservador, evita bucle infinito)
        if (nuevoEstado === undefined || nuevoEstado === EstadoDGII.ENVIADO) {
          nuevoEstado = EstadoDGII.RECHAZADO;
          this.logger.warn(`e-CF ${resultado.ecf} → RECHAZADO (sin confirmación de DGII tras batch Error)`);
        }
      }

      // Estado no mapeado (nuevo estado de MSeller no conocido)
      if (nuevoEstado === undefined) {
        this.logger.warn(`e-CF ${resultado.ecf} estado desconocido: "${resultado.status}" — sin acción`);
        continue;
      }

      if (nuevoEstado === EstadoDGII.ENVIADO) {
        this.logger.debug(`e-CF ${resultado.ecf} aún procesando (${resultado.status})`);
        continue;
      }

      const batchData = resultado.data as any;
      const rawRespuestaDgii: any = batchData ?? { status: resultado.status };
      // La respuesta del batch no incluye dgiiResponse[] (donde vive secuenciaUtilizada).
      // Si el dato previo tenía ese array, preservarlo para que el gate de reenvío y
      // la UI puedan seguir leyendo secuenciaUtilizada correctamente.
      const prevRespuestaDgii = ecf.respuestaDgii as any;
      const respuestaDgii = (!rawRespuestaDgii.dgiiResponse && prevRespuestaDgii?.dgiiResponse)
        ? { ...rawRespuestaDgii, dgiiResponse: prevRespuestaDgii.dgiiResponse }
        : rawRespuestaDgii;
      await this.ecfRepo.update(ecf.id, {
        estadoDGII:    nuevoEstado,
        respuestaDgii,
        // Guardar QR url del comprobante aceptado si viene en la respuesta batch
        ...(batchData?.qr_url    ? { qrUrl: batchData.qr_url }       : {}),
        fechaUso:      nuevoEstado === EstadoDGII.ACEPTADO ? new Date() : undefined,
      });

      await this.logEvento(ecf.id, TipoEcfEvento.RESPUESTA_RECIBIDA, {
        estadoMSeller: resultado.status,
        estadoInterno: nuevoEstado,
        via:           'batch',
      });
      await this.logEvento(ecf.id, TipoEcfEvento.ESTADO_CAMBIADO, {
        de: EstadoDGII.ENVIADO, a: nuevoEstado,
      });

      this.logger.log(`e-CF ${resultado.ecf}: ENVIADO → ${nuevoEstado} (batch)`);

      // Aplicar/revertir efectos sobre la factura si es NC de anulación total
      this.efectosNc.aplicarEfectosPorEstado(ecf, nuevoEstado).catch(err =>
        this.logger.error(`[ConsultarEstado] Error aplicando efectos NC ${ecf.numero}: ${(err as Error).message}`),
      );
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
