import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ECF, EstadoDGII } from '../entities/ecf.entity';
import { EcfEvento, TipoEcfEvento } from '../entities/ecf-evento.entity';
import { MSellerClientService } from '../services/mseller-client.service';
import { EcfEfectosNcService } from '../services/ecf-efectos-nc.service';
import { EmailService } from '../../notificaciones/services/email.service';
import { reportServiceError } from '../../common/observability/sentry';

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
    private readonly emailSvc: EmailService,
    private readonly configSvc: ConfigService,
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
      // Si es NC de anulación total, liberar anulacionPendiente de la factura ANTES
      // de sellar CONTINGENCIA. Si el efecto falla, NO sellamos → el e-CF sigue
      // ENVIADO y se reintenta en la próxima pasada. reportServiceError ya se emitió
      // dentro de aplicarEfectosPorEstado. No abortar el lote: siguiente e-CF.
      try {
        await this.efectosNc.aplicarEfectosPorEstado(ecf, EstadoDGII.CONTINGENCIA);
      } catch (err) {
        this.logger.error(
          `[ConsultarEstado] Efecto CONTINGENCIA NC ${ecf.numero} falló — e-CF queda ENVIADO para reintento: ` +
          `${(err as Error).message}`,
        );
        continue;
      }

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
      // Extraer secuenciaUtilizada de la respuesta DGII.
      // Vive dentro de dgiiResponse[].secuenciaUtilizada (boolean | undefined).
      // Si varios ítems la traen, tomamos el primero con valor definido.
      // Pasamos el valor al handler de efectos ANTES de que se selle la columna
      // dedicada en el update de abajo, porque los efectos se aplican antes de sellar.
      const dgiiItemsSeq: any[] = (respuestaDgii as any)?.dgiiResponse ?? [];
      const itemConSeq = dgiiItemsSeq.find(
        (d: any) => d?.secuenciaUtilizada !== undefined && d?.secuenciaUtilizada !== null,
      );
      const secuenciaUtilizada: boolean | undefined = itemConSeq?.secuenciaUtilizada;

      // Aplicar/revertir efectos sobre la factura (NC de anulación total) ANTES de
      // sellar el estado definitivo. Si el efecto falla, NO commiteamos estadoDGII →
      // el e-CF queda ENVIADO y el cron lo reintenta en la próxima pasada (cada 2 min),
      // en vez de dar el estado por procesado y dejar la factura inconsistente.
      // reportServiceError ya se emitió dentro de aplicarEfectosPorEstado. El lote NO
      // se aborta: continuamos con el siguiente e-CF.
      try {
        await this.efectosNc.aplicarEfectosPorEstado(ecf, nuevoEstado, secuenciaUtilizada);
      } catch (err) {
        this.logger.error(
          `[ConsultarEstado] Efecto NC ${ecf.numero} falló — e-CF queda ENVIADO para reintento: ` +
          `${(err as Error).message}`,
        );
        continue;
      }

      await this.ecfRepo.update(ecf.id, {
        estadoDGII:    nuevoEstado,
        respuestaDgii,
        // Sellar secuenciaUtilizada obtenida de DGII (null si no vino en la respuesta)
        secuenciaUtilizada: secuenciaUtilizada ?? null,
        // Guardar QR url del comprobante aceptado si viene en la respuesta batch
        ...(batchData?.qr_url    ? { qrUrl: batchData.qr_url }       : {}),
        fechaUso:      nuevoEstado === EstadoDGII.ACEPTADO ? new Date() : undefined,
      });

      // Notificar al super admin la primera vez que un e-CF quede RECHAZADO.
      // La marca superAdminNotificado garantiza idempotencia: el cron puede pasar
      // por este e-CF muchas veces, pero solo el primer rechazo envía el email.
      if (nuevoEstado === EstadoDGII.RECHAZADO && !ecf.superAdminNotificado) {
        await this.notificarRechazoSuperAdmin(ecf, respuestaDgii).catch((err: Error) => {
          this.logger.error(`[NotifRechazo] Error inesperado para ${ecf.numero}: ${err.message}`);
        });
      }

      await this.logEvento(ecf.id, TipoEcfEvento.RESPUESTA_RECIBIDA, {
        estadoMSeller: resultado.status,
        estadoInterno: nuevoEstado,
        via:           'batch',
      });
      await this.logEvento(ecf.id, TipoEcfEvento.ESTADO_CAMBIADO, {
        de: EstadoDGII.ENVIADO, a: nuevoEstado,
      });

      this.logger.log(`e-CF ${resultado.ecf}: ENVIADO → ${nuevoEstado} (batch)`);
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

  /**
   * Envía un email de alerta al super admin cuando un e-CF queda RECHAZADO.
   * Si el envío tiene éxito → marca superAdminNotificado=true (idempotencia).
   * Si falla → reporta a Sentry y deja la marca en false para reintentar.
   * No lanza: el cron no se aborta por un email fallido.
   */
  private async notificarRechazoSuperAdmin(ecf: ECF, respuestaDgii: any): Promise<void> {
    const adminEmail = this.configSvc.get<string>('NOTIF_ADMIN_EMAIL', '')
      || process.env['SUPER_ADMIN_EMAIL']
      || 'admin@hicloudrd.com';

    // Obtener nombre y RNC de la empresa emisora
    let empresaNombre = `Empresa #${ecf.empresaId}`;
    let empresaRnc    = '';
    try {
      const rows = await this.ecfRepo.manager.query(
        `SELECT "nombreComercial", rnc FROM empresa WHERE id = $1 LIMIT 1`,
        [ecf.empresaId],
      ) as { nombreComercial: string; rnc: string }[];
      if (rows[0]) {
        empresaNombre = rows[0].nombreComercial || empresaNombre;
        empresaRnc    = rows[0].rnc         || '';
      }
    } catch { /* fallback a empresaId */ }

    // Extraer mensajes de DGII del JSONB preservado
    const dgiiItems: any[] = respuestaDgii?.dgiiResponse ?? [];
    const mensajes: any[]  = dgiiItems.flatMap((d: any) => d?.mensajes ?? []);
    const mensajesHtml = mensajes.length
      ? mensajes.map((m: any) =>
          `<li><strong>${m.codigo ?? m.codigoMensaje ?? '?'}</strong>: ${m.valor ?? m.descripcion ?? m.mensaje ?? JSON.stringify(m)}</li>`,
        ).join('')
      : `<li style="color:#666">Sin mensajes específicos de DGII — ver campo respuestaDgii en la BD.</li>`;

    const tipoLabel  = ecf.numero.substring(0, 3).toUpperCase(); // e.g. "E31"
    const montoLabel = ecf.montoTotal != null
      ? `RD$${Number(ecf.montoTotal).toLocaleString('es-DO', { minimumFractionDigits: 2 })}`
      : 'N/D';
    const fechaLabel = new Date(ecf.createdAt).toLocaleString('es-DO', { timeZone: 'America/Santo_Domingo' });

    const result = await this.emailSvc.enviar({
      to:      adminEmail,
      subject: `🚫 e-CF RECHAZADO — ${ecf.numero} · ${empresaNombre}`,
      html: `
<p>El comprobante fiscal electrónico <strong>${ecf.numero}</strong> de la empresa
<strong>${empresaNombre}</strong>${empresaRnc ? ` (RNC&nbsp;${empresaRnc})` : ''}
fue <strong style="color:#dc2626">RECHAZADO</strong> por DGII.</p>

<table style="border-collapse:collapse;font-size:14px;margin:12px 0">
  <tr><td style="padding:4px 10px;color:#555;white-space:nowrap">e-NCF</td>      <td style="padding:4px 10px"><strong>${ecf.numero}</strong></td></tr>
  <tr><td style="padding:4px 10px;color:#555">Tipo</td>       <td style="padding:4px 10px">${tipoLabel}</td></tr>
  <tr><td style="padding:4px 10px;color:#555">Monto</td>      <td style="padding:4px 10px">${montoLabel}</td></tr>
  <tr><td style="padding:4px 10px;color:#555">Comprador</td>  <td style="padding:4px 10px">${ecf.razonSocialComprador ?? 'Consumidor Final'}${ecf.rncComprador ? ` (${ecf.rncComprador})` : ''}</td></tr>
  <tr><td style="padding:4px 10px;color:#555">Fecha</td>      <td style="padding:4px 10px">${fechaLabel}</td></tr>
  <tr><td style="padding:4px 10px;color:#555">Empresa</td>    <td style="padding:4px 10px">${empresaNombre}${empresaRnc ? ` · ${empresaRnc}` : ''}</td></tr>
</table>

<h4 style="margin-top:16px;margin-bottom:8px">Observación DGII:</h4>
<ul style="background:#fef2f2;border:1px solid #fecaca;border-radius:6px;padding:10px 10px 10px 28px;margin:0">
  ${mensajesHtml}
</ul>

<p style="margin-top:14px">
  Acciones disponibles en <em>Super Admin → Módulo e-CF → Rechazados</em>.
</p>
<p style="color:#888;font-size:12px;margin-top:20px">HiCloud ERP — Alerta automática de comprobante fiscal rechazado</p>`,
    });

    if (result.exitoso) {
      await this.ecfRepo.update(ecf.id, { superAdminNotificado: true });
      this.logger.log(`[NotifRechazo] Email enviado para e-CF ${ecf.numero} → superAdminNotificado=true`);
    } else {
      reportServiceError(
        new Error(result.error ?? 'Fallo al enviar email de rechazo e-CF'),
        'ecf_rechazado_notif_email',
        { ecfId: String(ecf.id), numero: ecf.numero, empresaId: String(ecf.empresaId) },
      );
      this.logger.warn(`[NotifRechazo] Email fallido para ${ecf.numero} — se reintentará en próxima pasada`);
    }
  }
}
