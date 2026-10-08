import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as Sentry from '@sentry/nestjs';
import { ECF, EstadoDGII, DocumentoOrigenTipo } from '../entities/ecf.entity';
import { EcfEvento, TipoEcfEvento } from '../entities/ecf-evento.entity';
import { MSellerClientService } from '../services/mseller-client.service';
import { EcfEfectosNcService } from '../services/ecf-efectos-nc.service';
import { EmailService } from '../../notificaciones/services/email.service';
import { NotificacionesService } from '../../notificaciones/notificaciones.service';
import { TipoNotificacion } from '../../notificaciones/entities/notificacion-enviada.entity';
import { reportServiceError } from '../../common/observability/sentry';
import { Factura } from '../../facturas/entities/factura.entity';
import { RealtimeService } from '../../realtime/realtime.service';
import { sellarFacturaPagadaSiCorresponde } from '../services/sellar-factura-pagada.helper';

const MINUTOS_SIN_RESPUESTA = 2;   // esperar 2 min antes de primer intento

/**
 * Backoff de EN_VALIDACION_DGII (reconsulta automática, PASO 2b del hotfix
 * E320000001774): cada vez más espaciado mientras más tiempo pasa desde el
 * envío original, hasta que a las 72h se deja de insistir y pasa a revisión
 * manual — mismo plazo que DIAS_MAX_POLLING para ENVIADO→CONTINGENCIA.
 */
const BACKOFF_MINUTOS_PRIMERAS_2H  = 15;
const BACKOFF_MINUTOS_HASTA_24H    = 60;
const BACKOFF_MINUTOS_HASTA_72H    = 180;
const UMBRAL_REVISION_MANUAL_HORAS = 72;
/** Mínimo absoluto entre dos consultas — también el piso del filtro SQL de "candidatos". */
const BACKOFF_MINUTOS_MINIMO       = BACKOFF_MINUTOS_PRIMERAS_2H;

function intervaloBackoffMinutos(horasDesdeEnvio: number): number {
  if (horasDesdeEnvio < 2)  return BACKOFF_MINUTOS_PRIMERAS_2H;
  if (horasDesdeEnvio < 24) return BACKOFF_MINUTOS_HASTA_24H;
  return BACKOFF_MINUTOS_HASTA_72H;
}

/**
 * Días máximos antes de marcar un ENVIADO como contingencia.
 * MSeller usa webhooks como mecanismo principal de notificación.
 * El polling es fallback para los primeros 3 días. Pasado ese plazo,
 * si no llegó webhook ni respuesta por polling, el comprobante
 * se marca contingencia para no bloquear la cola indefinidamente.
 */
const DIAS_MAX_POLLING = 3;

/** Pausa entre llamadas a MSeller dentro de una misma pasada — nunca ráfaga (hotfix 2026-10-07). */
const PAUSA_ENTRE_LLAMADAS_MS = 400;

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
 * ¿Esta respuesta trae un veredicto REAL de DGII (al menos un código o
 * mensaje), o es solo un status sin contenido verificable?
 *
 * Existe porque MSeller puede marcar "Rechazado" sin traer nada adjunto en
 * ciertos escenarios de error interno — un "Rechazado" sin ningún código ni
 * mensaje no es distinguible de un error de MSeller/DGII disfrazado de
 * rechazo. Por diseño (hotfix E320000001774, Ferretería Pavel — DGII en
 * mantenimiento marcado como rechazo): RECHAZADO solo se sella cuando hay
 * algo verificable detrás.
 */
export function tieneVeredictoDgiiReal(datos: unknown, mensaje?: string): boolean {
  const items: any[] = (datos as any)?.dgiiResponse ?? [];
  const tieneCodigoOMensajeEnItems = items.some((d: any) => {
    const msgs = d?.mensajes ?? [];
    return (Array.isArray(msgs) && msgs.length > 0) || d?.codigo != null || d?.codigoMensaje != null;
  });
  return tieneCodigoOMensajeEnItems || !!(mensaje && mensaje.trim().length > 0);
}

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
  /** Último aviso a Sentry de posible caída/mantenimiento de DGII — máx 1/hora, no por e-CF. */
  private ultimaAlertaDgiiCaidaAt = 0;

  constructor(
    @InjectRepository(ECF)
    private readonly ecfRepo: Repository<ECF>,

    @InjectRepository(EcfEvento)
    private readonly eventoRepo: Repository<EcfEvento>,

    private readonly mseller: MSellerClientService,
    private readonly efectosNc: EcfEfectosNcService,
    private readonly emailSvc: EmailService,
    private readonly notificacionesSvc: NotificacionesService,
    private readonly configSvc: ConfigService,

    @InjectRepository(Factura)
    private readonly facturaRepo: Repository<Factura>,

    private readonly realtimeService: RealtimeService,
  ) {}

  @Cron('*/2 * * * *', { name: 'consultar-estado-ecf' }) // cada 2 min
  async run(force = false): Promise<void> {
    if (this.running) return;
    // Circuit breaker GLOBAL por 429 (hotfix 2026-10-07) — se salta el
    // ciclo COMPLETO (incluida la reconciliación de EN_VALIDACION_DGII):
    // consultar e-CF por e-CF mientras MSeller está devolviendo 429 solo
    // alarga el bloqueo. La próxima pasada (2 min) lo revisa de nuevo.
    const circuitoHasta = await this.mseller.circuitoGlobal429Hasta();
    if (circuitoHasta) {
      this.logger.warn(
        `ConsultarEstadoECF: circuit breaker GLOBAL activo por 429 hasta ${circuitoHasta.toISOString()} — se salta todo el ciclo.`,
      );
      return;
    }
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
    if (enviados.length > 0) {
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
        // Lotes pequeños, nunca ráfaga entre empresas (hotfix 2026-10-07).
        await this.sleep(PAUSA_ENTRE_LLAMADAS_MS);
        if (await this.mseller.circuitoGlobal429Hasta()) {
          this.logger.warn('ConsultarEstadoECF: 429 durante el lote de ENVIADO — se corta el resto del ciclo.');
          return;
        }
      }
    }

    // Paso 3: EN_VALIDACION_DGII con backoff — independiente de si hubo
    // ENVIADOs que consultar arriba.
    await this.consultarEnValidacion();
  }

  /** Consulta y actualiza el estado de un único e-CF por número (para uso desde el controller). */
  async consultarUno(ecf: ECF): Promise<void> {
    if (!ecf.empresaId) return;
    await this.consultarBatch([ecf], ecf.empresaId);
  }

  /**
   * PASO 2b del hotfix E320000001774: reconsulta automática de
   * EN_VALIDACION_DGII con backoff (15min las primeras 2h, 1h hasta 24h, 3h
   * hasta 72h). Pasadas 72h sin veredicto → revisionManual + aviso a la
   * empresa, sin seguir insistiendo. Usa la MISMA consultarBatch() que el
   * botón "Consultar estado en DGII" y el Paso 2 de ENVIADO — nunca una
   * segunda implementación. Freno global: como mucho
   * ECF_MAX_CONSULTAS_POR_PASADA (default 50) por pasada, las más antiguas
   * primero.
   */
  private async consultarEnValidacion(): Promise<void> {
    const ahora           = new Date();
    const umbralRevision  = new Date(ahora.getTime() - UMBRAL_REVISION_MANUAL_HORAS * 60 * 60_000);
    const maxPorPasada    = this.configSvc.get<number>('ECF_MAX_CONSULTAS_POR_PASADA', 50);

    // 3a. Los que ya llevan 72h+ sin veredicto → revisión manual, sin gastar
    // otra consulta. El resumen horario y el aviso a la empresa los recogen.
    const vencidos = await this.ecfRepo
      .createQueryBuilder('ecf')
      .where('ecf.estadoDGII = :estado', { estado: EstadoDGII.EN_VALIDACION_DGII })
      .andWhere('ecf.isActive = true')
      .andWhere('ecf.revisionManual = false')
      .andWhere('ecf.createdAt < :umbralRevision', { umbralRevision })
      .getMany();

    for (const ecf of vencidos) {
      await this.ecfRepo.update(ecf.id, { revisionManual: true });
      await this.logEvento(ecf.id, TipoEcfEvento.ESTADO_CAMBIADO, {
        via: 'backoff-vencido', estado: EstadoDGII.EN_VALIDACION_DGII,
      }, `Sin veredicto de DGII tras ${UMBRAL_REVISION_MANUAL_HORAS}h — queda para revisión manual`);
      this.logger.warn(`e-CF ${ecf.numero} → revisionManual=true (${UMBRAL_REVISION_MANUAL_HORAS}h sin veredicto de DGII)`);
      await this.notificarRevisionManualEmpresa(ecf).catch((err: Error) => {
        this.logger.error(`[RevisionManual] Error notificando a la empresa para ${ecf.numero}: ${err.message}`);
      });
    }
    if (vencidos.length > 0) {
      this.logger.warn(`${vencidos.length} e-CF(s) → revisionManual por ${UMBRAL_REVISION_MANUAL_HORAS}h sin veredicto`);
    }

    // 3b. Candidatos dentro de las 72h — el filtro SQL usa el backoff MÍNIMO
    // (15 min) para no traer de más; el backoff exacto según edad se aplica
    // en memoria abajo, porque depende de cuánto hace que se envió cada uno.
    const corteMinimo = new Date(ahora.getTime() - BACKOFF_MINUTOS_MINIMO * 60_000);
    const candidatos = await this.ecfRepo
      .createQueryBuilder('ecf')
      .where('ecf.estadoDGII = :estado', { estado: EstadoDGII.EN_VALIDACION_DGII })
      .andWhere('ecf.isActive = true')
      .andWhere('ecf.revisionManual = false')
      .andWhere('ecf.createdAt >= :umbralRevision', { umbralRevision })
      .andWhere('ecf.trackId IS NOT NULL')
      .andWhere('(ecf.ultimaConsultaAt IS NULL OR ecf.ultimaConsultaAt < :corteMinimo)', { corteMinimo })
      .orderBy('ecf.createdAt', 'ASC') // las más antiguas primero
      .take(maxPorPasada * 3) // margen: no todas estarán vencidas para SU backoff exacto
      .getMany();

    const aConsultar: ECF[] = [];
    for (const ecf of candidatos) {
      const horasDesdeEnvio = (ahora.getTime() - new Date(ecf.createdAt).getTime()) / 3_600_000;
      const intervaloMin    = intervaloBackoffMinutos(horasDesdeEnvio);
      const vencidaConsulta = !ecf.ultimaConsultaAt
        || (ahora.getTime() - new Date(ecf.ultimaConsultaAt).getTime()) >= intervaloMin * 60_000;
      if (vencidaConsulta) aConsultar.push(ecf);
      if (aConsultar.length >= maxPorPasada) break; // freno global — ya vienen ordenados por antigüedad
    }

    if (aConsultar.length === 0) return;

    this.logger.log(`ConsultarEstadoECF: ${aConsultar.length} e-CF(s) EN_VALIDACION_DGII a reconsultar (backoff)`);

    const porEmpresa = new Map<number, ECF[]>();
    for (const ecf of aConsultar) {
      if (!ecf.empresaId) continue;
      if (!porEmpresa.has(ecf.empresaId)) porEmpresa.set(ecf.empresaId, []);
      porEmpresa.get(ecf.empresaId)!.push(ecf);
    }

    let totalProcesados = 0;
    let totalAmbiguos   = 0;
    for (const [empresaId, ecfs] of porEmpresa) {
      const stats = await this.consultarBatch(ecfs, empresaId);
      totalProcesados += stats.total;
      totalAmbiguos    += stats.ambiguos;
      await this.sleep(PAUSA_ENTRE_LLAMADAS_MS);
      if (await this.mseller.circuitoGlobal429Hasta()) {
        this.logger.warn('ConsultarEstadoECF: 429 durante el lote de EN_VALIDACION_DGII — se corta el resto del ciclo.');
        return;
      }
    }

    // Si la mayoría de las respuestas de ESTA pasada siguen sin veredicto,
    // es más probable que DGII esté caída/en mantenimiento que un problema
    // de HiCloud — un aviso, no uno por cada e-CF.
    if (totalProcesados > 0 && totalAmbiguos / totalProcesados > 0.5) {
      this.avisarPosibleCaidaDgii(totalAmbiguos, totalProcesados);
    }
  }

  /** Aviso a Sentry (nivel warning, máx 1/hora) de que DGII podría estar caída/en mantenimiento. */
  private avisarPosibleCaidaDgii(ambiguos: number, total: number): void {
    const ahora = Date.now();
    if (ahora - this.ultimaAlertaDgiiCaidaAt < 60 * 60_000) return;
    this.ultimaAlertaDgiiCaidaAt = ahora;

    this.logger.warn(`[DGII] Posible caída/mantenimiento: ${ambiguos}/${total} consultas sin veredicto en esta pasada`);
    if (!Sentry.getClient()) return;
    try {
      Sentry.captureMessage(
        `Posible caída/mantenimiento de DGII: ${ambiguos}/${total} consultas EN_VALIDACION_DGII sin veredicto en esta pasada del cron`,
        { level: 'warning', tags: { origin: 'ecf_consultar_estado', ambiguos: String(ambiguos), total: String(total) } },
      );
    } catch { /* nunca romper el cron por un fallo de observabilidad */ }
  }

  /**
   * Avisa a ADMIN/CONTADOR de la empresa (no al super admin) que un e-CF
   * pasó a revisión manual — mismo patrón que
   * FacturasRecurrentesService.enviarAvisoPrevio: JOIN users↔usuario_empresa,
   * roles en minúscula (valor persistido, no el enum TS), + NOTIF_ADMIN_EMAIL
   * como copia si no está ya en la lista.
   */
  private async notificarRevisionManualEmpresa(ecf: ECF): Promise<void> {
    if (!ecf.empresaId) return;

    const admins = await this.ecfRepo.manager.query(
      `SELECT u.email FROM users u
       JOIN usuario_empresa ue ON ue."userId" = u.id
       WHERE ue."empresaId" = $1 AND ue."isActive" = true
         AND u."isActive" = true AND u.role IN ('admin','contador')
       LIMIT 5`,
      [ecf.empresaId],
    ) as { email: string }[];

    const destinatarios = admins.map(a => a.email);
    const adminGlobal = this.configSvc.get<string>('NOTIF_ADMIN_EMAIL', '').trim();
    if (adminGlobal && !destinatarios.includes(adminGlobal)) destinatarios.push(adminGlobal);
    if (!destinatarios.length) return;

    const tipoLabel  = ecf.numero.substring(0, 3).toUpperCase();
    const montoLabel = ecf.montoTotal != null
      ? `RD$${Number(ecf.montoTotal).toLocaleString('es-DO', { minimumFractionDigits: 2 })}`
      : 'N/D';

    // Campanita (canal SISTEMA) — antes este aviso SOLO salía por correo y
    // no tenía ninguna superficie en el centro de notificaciones unificado.
    await this.notificacionesSvc.notificarSistemaEmpresa(
      ecf.empresaId,
      TipoNotificacion.ECF_REVISION_MANUAL,
      `e-CF ${ecf.numero} sin respuesta de DGII — revisión manual`,
      `El comprobante ${ecf.numero} (${tipoLabel}, ${montoLabel}) lleva más de ${UMBRAL_REVISION_MANUAL_HORAS}h ` +
      `en validación con DGII sin confirmación ni rechazo. Verifica el estado en el portal de DGII.`,
      ecf.numero,
    ).catch((e: Error) => this.logger.warn(`notificarSistemaEmpresa (revisión manual) falló: ${e.message}`));

    const result = await this.emailSvc.enviar({
      to:      destinatarios,
      subject: `⏳ e-CF ${ecf.numero} sin respuesta de DGII tras ${UMBRAL_REVISION_MANUAL_HORAS}h — revisión manual`,
      html: `
<p>El comprobante fiscal electrónico <strong>${ecf.numero}</strong> (${tipoLabel}, ${montoLabel}) sigue
<strong>en validación con DGII</strong> desde hace más de ${UMBRAL_REVISION_MANUAL_HORAS} horas, sin que DGII
haya confirmado ni rechazado el comprobante.</p>
<p>HiCloud dejó de reintentar automáticamente — <strong>no es un rechazo</strong>, pero conviene verificar
el estado directamente en el portal de DGII u ofimática de la empresa.</p>
<p style="color:#888;font-size:12px;margin-top:20px">HiCloud ERP — Aviso automático de comprobante fiscal en validación</p>`,
    });

    if (!result.exitoso) {
      reportServiceError(
        new Error(result.error ?? 'Fallo al enviar aviso de revisión manual e-CF'),
        'ecf_revision_manual_notif_email',
        { ecfId: String(ecf.id), numero: ecf.numero, empresaId: String(ecf.empresaId) },
      );
    }
  }

  /**
   * @returns estadísticas de la pasada — `total` consultados, `ambiguos`
   * los que terminaron (o siguen) en EN_VALIDACION_DGII. Las usa
   * consultarEnValidacion() para decidir si avisar a Sentry de una posible
   * caída/mantenimiento de DGII (muchos ambiguos de golpe).
   */
  private async consultarBatch(ecfs: ECF[], empresaId: number): Promise<{ total: number; ambiguos: number }> {
    const numeros = ecfs.map(e => e.numero);
    const stats = { total: 0, ambiguos: 0 };
    let response: Awaited<ReturnType<MSellerClientService['consultarBatch']>>;

    try {
      response = await this.mseller.consultarBatch(numeros, empresaId);
    } catch (err: any) {
      this.logger.warn(`consultarBatch empresaId=${empresaId}: ${(err as Error).message}`);
      return stats;
    }

    const ecfMap = new Map(ecfs.map(e => [e.numero, e]));

    for (const resultado of response.results ?? []) {
      this.logger.debug(
        `[batch] ecf=${resultado.ecf} status="${resultado.status}" found=${resultado.found}`,
      );

      const ecf = ecfMap.get(resultado.ecf);
      if (!ecf) {
        this.logger.warn(`e-CF ${resultado.ecf} no encontrado en BD local`);
        continue;
      }
      stats.total++;

      // Marcar el intento de consulta YA, antes de cualquier `continue` de
      // abajo — si no, un e-CF que siga ambiguo (sin encontrarse, sin mapeo,
      // o "Procesando") nunca actualizaría ultimaConsultaAt y el backoff de
      // consultarEnValidacion() lo re-consultaría cada 2 min en vez de
      // respetar el intervalo (15min/1h/3h).
      if (ecf.estadoDGII === EstadoDGII.EN_VALIDACION_DGII) {
        await this.ecfRepo.update(ecf.id, {
          ultimaConsultaAt:    new Date(),
          consultasRealizadas: ecf.consultasRealizadas + 1,
        });
      }

      if (!resultado.found) {
        this.logger.warn(`e-CF no encontrado en MSeller: ${resultado.ecf}`);
        stats.ambiguos++;
        continue;
      }

      const estadoKey = resultado.status?.toUpperCase() ?? '';
      let nuevoEstado: EstadoDGII | undefined = MSELLER_ESTADO_MAP[estadoKey];
      let datosVeredicto: unknown = resultado.data;
      let mensajeVeredicto: string | undefined;

      // Batch devuelve "Error" o vacío (típico cuando DGII no responde — p.
      // ej. mantenimiento) → intentar consulta individual por trackId antes
      // de decidir. NUNCA se asume rechazo por esto — ver el fallback de
      // abajo, que va a EN_VALIDACION_DGII, no a RECHAZADO.
      if (estadoKey === 'ERROR' || estadoKey === '') {
        this.logger.warn(
          `e-CF ${resultado.ecf} status="${resultado.status}" ambiguo (batch) — data: ${JSON.stringify(resultado.data)}`,
        );
        if (ecf.trackId) {
          try {
            const ind    = await this.mseller.consultarEstado(ecf.trackId, empresaId);
            const indKey = ind.status?.toUpperCase() ?? '';
            nuevoEstado      = MSELLER_ESTADO_MAP[indKey];
            datosVeredicto   = (ind as any).details ?? datosVeredicto;
            mensajeVeredicto = ind.message;
            this.logger.log(
              `e-CF ${resultado.ecf} consulta individual: "${ind.status}" → ${nuevoEstado ?? 'sin mapeo'}`,
            );
          } catch (indErr: any) {
            this.logger.warn(
              `e-CF ${resultado.ecf} consulta individual fallida: ${(indErr as Error).message}`,
            );
          }
        }
        // Sigue sin estado definitivo → EN_VALIDACION_DGII, NUNCA RECHAZADO
        // sin veredicto real de DGII. El backoff automático (ver
        // consultarPendientes) y revisionManual a las 72h evitan el bucle
        // infinito — ya no hace falta "resolver" esto aquí a la fuerza.
        if (nuevoEstado === undefined || nuevoEstado === EstadoDGII.ENVIADO) {
          nuevoEstado = EstadoDGII.EN_VALIDACION_DGII;
          this.logger.warn(`e-CF ${resultado.ecf} → EN_VALIDACION_DGII (sin confirmación real de DGII)`);
        }
      }

      // Estado no mapeado (nuevo estado de MSeller no conocido, distinto de
      // "Error"/vacío — un status genuinamente desconocido) — sin acción,
      // como antes.
      if (nuevoEstado === undefined) {
        this.logger.warn(`e-CF ${resultado.ecf} estado desconocido: "${resultado.status}" — sin acción`);
        stats.ambiguos++;
        continue;
      }

      if (nuevoEstado === EstadoDGII.ENVIADO) {
        this.logger.debug(`e-CF ${resultado.ecf} aún procesando (${resultado.status})`);
        stats.ambiguos++;
        continue;
      }

      // Salvaguarda final: aunque MSeller/DGII diga "Rechazado" explícito,
      // sin NINGÚN código ni mensaje real adjunto no es un veredicto
      // verificable — mejor EN_VALIDACION_DGII que un rechazo fantasma (con
      // su alerta inmediata al super admin, ver más abajo).
      if (nuevoEstado === EstadoDGII.RECHAZADO && !tieneVeredictoDgiiReal(datosVeredicto, mensajeVeredicto)) {
        nuevoEstado = EstadoDGII.EN_VALIDACION_DGII;
        this.logger.warn(`e-CF ${resultado.ecf} status="Rechazado" pero SIN código/mensaje de DGII → EN_VALIDACION_DGII`);
      }

      if (nuevoEstado === EstadoDGII.EN_VALIDACION_DGII) stats.ambiguos++;

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

      // El e-CF de una factura CONTADO se confirmó ACEPTADO por esta vía
      // asíncrona (el envío síncrono original falló/dio timeout, por eso
      // sigue EMITIDA) — sellar PAGADA ahora que DGII ya lo aceptó, con el
      // mismo criterio de rastro de cobro que usa el POS. Nunca toca NOTA_
      // DEBITO/CREDITO/COMPRA/GASTO (otros documentoOrigenTipo). Caso real:
      // empresa 73, FAC-1705/1708-1714 (2026-10-07).
      if (nuevoEstado === EstadoDGII.ACEPTADO
          && (ecf.documentoOrigenTipo === DocumentoOrigenTipo.FACTURA || ecf.documentoOrigenTipo === DocumentoOrigenTipo.VENTA_POS)
          && ecf.documentoOrigenId) {
        try {
          const sellada = await sellarFacturaPagadaSiCorresponde(this.facturaRepo, ecf.documentoOrigenId, this.logger);
          if (sellada) this.realtimeService.notify(ecf.empresaId!, 'factura', 'updated', ecf.documentoOrigenId);
        } catch (err) {
          this.logger.error(`[SellarPagada] Error inesperado para factura #${ecf.documentoOrigenId}: ${(err as Error).message}`);
        }
      }

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
        de: ecf.estadoDGII, a: nuevoEstado,
      });

      this.logger.log(`e-CF ${resultado.ecf}: ${ecf.estadoDGII} → ${nuevoEstado} (batch)`);
    }

    return stats;
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

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
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
