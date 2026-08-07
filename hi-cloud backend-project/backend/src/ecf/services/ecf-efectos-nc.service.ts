import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ECF, DocumentoOrigenTipo, EstadoDGII } from '../entities/ecf.entity';
import { Factura, FacturaEstado } from '../../facturas/entities/factura.entity';
import { NotaCredito, EstadoNotaCredito } from '../../notas-credito/entities/nota-credito.entity';
import { reportServiceError } from '../../common/observability/sentry';

/**
 * Aplica los efectos financieros de una Nota de Crédito sobre su factura
 * original según el estado definitivo de DGII.
 *
 * ═══ INVARIANTE DE ARQUITECTURA ═══
 * Los efectos (cancelar factura, ajustar CxC) se aplican ÚNICAMENTE cuando
 * DGII confirma ACEPTADO u OBSERVADO. Nunca al emitir, nunca provisionalmente.
 * Si DGII rechaza, nada financiero fue tocado — no hay nada que revertir.
 *
 * ┌──────────────┬────────────────────────────────────────────────────────────┐
 * │ Estado DGII  │ Efecto                                                      │
 * ├──────────────┼────────────────────────────────────────────────────────────┤
 * │ ACEPTADO /   │ codigoMod=1 → cancela factura definitivamente               │
 * │ OBSERVADO    │ codigoMod=3 → aplica ajuste de CxC                          │
 * │              │ marca efectosAplicados=true (idempotencia)                  │
 * ├──────────────┼────────────────────────────────────────────────────────────┤
 * │ RECHAZADO    │ Limpia anulacionPendiente=false                             │
 * │              │ secuenciaUtilizada=false/null → NC vuelve a BORRADOR        │
 * │              │ secuenciaUtilizada=true       → NC queda en RECHAZADA       │
 * │              │ Sin efectos financieros (nada fue aplicado)                 │
 * ├──────────────┼────────────────────────────────────────────────────────────┤
 * │ CONTINGENCIA │ Libera anulacionPendiente sin efectos financieros           │
 * └──────────────┴────────────────────────────────────────────────────────────┘
 *
 * Usa transacción con pessimistic_write sobre la NC para garantizar idempotencia
 * bajo concurrencia entre webhook y cron.
 */
@Injectable()
export class EcfEfectosNcService {
  private readonly logger = new Logger(EcfEfectosNcService.name);

  constructor(
    @InjectRepository(Factura)
    private readonly facturaRepo: Repository<Factura>,

    @InjectRepository(NotaCredito)
    private readonly ncRepo: Repository<NotaCredito>,

    private readonly dataSource: DataSource,
  ) {}

  /**
   * @param secuenciaUtilizada  Extraída de la respuesta DGII por el caller antes
   *        de que se almacene en la columna dedicada. El parámetro llega antes de
   *        que el ecfRepo.update (que sella la columna) se ejecute, porque los
   *        efectos se aplican ANTES de sellar el estado definitivo.
   */
  async aplicarEfectosPorEstado(
    ecf: ECF,
    nuevoEstado: EstadoDGII,
    secuenciaUtilizada?: boolean | null,
  ): Promise<void> {
    if (ecf.documentoOrigenTipo !== DocumentoOrigenTipo.NOTA_CREDITO) return;
    // Solo codigoMod 1 (anulación total) y 3 (ajuste parcial) tienen efectos.
    if (ecf.codigoModificacion !== 1 && ecf.codigoModificacion !== 3) return;

    const estadosAccionables = [
      EstadoDGII.ACEPTADO,
      EstadoDGII.RECHAZADO,
      EstadoDGII.OBSERVADO,
      EstadoDGII.CONTINGENCIA,
    ];
    if (!estadosAccionables.includes(nuevoEstado)) return;

    try {
      await this.dataSource.transaction(async (em) => {
        // Lock pesimista: webhook y cron pueden llegar simultáneamente.
        // loadEagerRelations:false evita LEFT JOINs que rompen FOR UPDATE.
        const nc = await em.getRepository(NotaCredito).findOne({
          where: { id: ecf.documentoOrigenId, empresaId: ecf.empresaId ?? undefined },
          lock: { mode: 'pessimistic_write' },
          loadEagerRelations: false,
        });
        if (!nc) return;

        // ── CONTINGENCIA ────────────────────────────────────────────────────
        if (nuevoEstado === EstadoDGII.CONTINGENCIA) {
          // Liberar indicador visual; sin efectos financieros.
          if (nc.facturaOriginalId && ecf.codigoModificacion === 1) {
            await em.getRepository(Factura).update(
              { id: nc.facturaOriginalId, empresaId: ecf.empresaId ?? undefined },
              { anulacionPendiente: false },
            );
          }
          this.logger.warn(
            `[EcfEfectosNc] NC ${ecf.numero} → CONTINGENCIA — ` +
            `anulacionPendiente liberado${nc.facturaOriginalId ? ` en Factura #${nc.facturaOriginalId}` : ''}. ` +
            `Verificar portal DGII.`,
          );
          return;
        }

        // ── ACEPTADO / OBSERVADO ─────────────────────────────────────────────
        if (nuevoEstado === EstadoDGII.ACEPTADO || nuevoEstado === EstadoDGII.OBSERVADO) {
          if (nc.efectosAplicados) return; // idempotencia — lock garantiza que solo uno procede

          if (ecf.codigoModificacion === 1 && nc.facturaOriginalId) {
            // Anulación total: cancelar la factura definitivamente.
            await em.getRepository(Factura).update(
              { id: nc.facturaOriginalId, empresaId: ecf.empresaId ?? undefined },
              { estado: FacturaEstado.CANCELADA, anulacionPendiente: false },
            );
            this.logger.log(
              `[EcfEfectosNc] ${ecf.numero} ${nuevoEstado} → Factura #${nc.facturaOriginalId} CANCELADA definitivamente`,
            );
          }

          if (ecf.codigoModificacion === 3 && nc.facturaOriginalId) {
            // Ajuste parcial: aplicar descuento en CxC ahora que DGII confirmó.
            const [cxcRow] = await em.query<any[]>(
              `SELECT id, "montoPendiente", "montoOriginal", "montoPagado"
               FROM cuentas_por_cobrar
               WHERE "facturaId" = $1 AND "empresaId" = $2
                 AND "isActive" = true AND estado NOT IN ('anulada', 'pagada')
               LIMIT 1`,
              [nc.facturaOriginalId, ecf.empresaId],
            );
            if (cxcRow) {
              const nuevoPendiente = +Math.max(0, Number(cxcRow.montoPendiente) - Number(nc.total)).toFixed(2);
              const nuevoPagado    = +Math.max(0, Number(cxcRow.montoOriginal)  - nuevoPendiente).toFixed(2);
              const nuevoEstadoCxc = nuevoPendiente <= 0 ? 'pagada' : 'pagada_parcial';
              await em.query(
                `UPDATE cuentas_por_cobrar
                 SET "montoPendiente" = $1, "montoPagado" = $2, estado = $3
                 WHERE id = $4`,
                [nuevoPendiente, nuevoPagado, nuevoEstadoCxc, cxcRow.id],
              );
              this.logger.log(
                `[EcfEfectosNc] ${ecf.numero} ${nuevoEstado} → CxC Factura #${nc.facturaOriginalId} ` +
                `reducida ${nc.total} (pendiente=${nuevoPendiente})`,
              );
            }
          }

          await em.getRepository(NotaCredito).update(
            { id: nc.id, empresaId: ecf.empresaId ?? undefined },
            { efectosAplicados: true },
          );

          if (nuevoEstado === EstadoDGII.OBSERVADO) {
            this.logger.warn(`[EcfEfectosNc] NC ${ecf.numero} OBSERVADA — revisar observaciones en portal DGII`);
          }
          return;
        }

        // ── RECHAZADO ────────────────────────────────────────────────────────
        // La arquitectura garantiza que nada financiero fue aplicado al emitir.
        // Solo limpiar el indicador visual y marcar el estado de la NC.
        if (nuevoEstado === EstadoDGII.RECHAZADO) {
          if (nc.facturaOriginalId && ecf.codigoModificacion === 1) {
            await em.getRepository(Factura).update(
              { id: nc.facturaOriginalId, empresaId: ecf.empresaId ?? undefined },
              { anulacionPendiente: false },
            );
          }

          // secuenciaUtilizada: preferir el parámetro (viene de la respuesta actual);
          // como fallback leer la columna dedicada ya almacenada (reintento del cron).
          const seqUsed = secuenciaUtilizada ?? ecf.secuenciaUtilizada;

          // secuencia quemada (true)  → NC pasa a RECHAZADA (nueva NC requerida)
          // secuencia libre (false)   → NC vuelve a BORRADOR (puede corregir y reenviar)
          // sin información (null)    → BORRADOR (rechazos XML sin dgiiResponse[] no queman)
          const ncEstado = seqUsed === true
            ? EstadoNotaCredito.RECHAZADA
            : EstadoNotaCredito.BORRADOR;

          await em.getRepository(NotaCredito).update(
            { id: nc.id, empresaId: ecf.empresaId ?? undefined },
            { estado: ncEstado, efectosAplicados: false },
          );

          this.logger.warn(
            `[EcfEfectosNc] NC ${ecf.numero} RECHAZADA → NC #${nc.id} → ${ncEstado} ` +
            `(secuenciaUtilizada=${seqUsed})`,
          );
        }
      });
    } catch (err) {
      // TIPO A (efecto de dinero): reportar a Sentry y PROPAGAR. El caller NO sella
      // estadoDGII cuando el efecto falla — el cron reintenta en la próxima pasada.
      reportServiceError(err, 'ecf_efectos_nc_aplicar', {
        ecfId:             ecf.id,
        numero:            ecf.numero,
        empresaId:         String(ecf.empresaId ?? ''),
        documentoOrigenId: String(ecf.documentoOrigenId ?? ''),
        estadoIntentado:   nuevoEstado,
      });
      throw err;
    }
  }
}
