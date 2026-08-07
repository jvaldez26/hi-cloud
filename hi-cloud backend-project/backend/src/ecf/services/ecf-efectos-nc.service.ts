import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ECF, DocumentoOrigenTipo, EstadoDGII } from '../entities/ecf.entity';
import { Factura, FacturaEstado } from '../../facturas/entities/factura.entity';
import { NotaCredito, EstadoNotaCredito } from '../../notas-credito/entities/nota-credito.entity';
import { reportServiceError } from '../../common/observability/sentry';

/**
 * Aplica o revierte los efectos de una Nota de Crédito sobre su factura original
 * según el estado DGII definitivo. Solo actúa sobre ECFs de tipo NOTA_CREDITO
 * con codigoModificacion=1 (anulación total).
 *
 * - ACEPTADO / OBSERVADO → cancela la factura definitivamente
 * - RECHAZADO            → revierte el estado provisional (anulacionPendiente=false)
 *                         y marca la NC como ANULADA para no contar en balance
 * - CONTINGENCIA         → libera anulacionPendiente sin cancelar; el usuario
 *                         debe confirmar el estado real en el portal DGII
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

  async aplicarEfectosPorEstado(ecf: ECF, nuevoEstado: EstadoDGII): Promise<void> {
    if (ecf.documentoOrigenTipo !== DocumentoOrigenTipo.NOTA_CREDITO) return;

    const estadosAccionables = [
      EstadoDGII.ACEPTADO,
      EstadoDGII.RECHAZADO,
      EstadoDGII.OBSERVADO,
      EstadoDGII.CONTINGENCIA,
    ];
    if (!estadosAccionables.includes(nuevoEstado)) return;

    // ── codigoMod=3 RECHAZADO: revertir el ajuste de CxC aplicado en emitir() ──
    if (ecf.codigoModificacion === 3 && nuevoEstado === EstadoDGII.RECHAZADO) {
      try {
        await this.dataSource.transaction(async (em) => {
          const nc = await em.getRepository(NotaCredito).findOne({
            where: { id: ecf.documentoOrigenId, empresaId: ecf.empresaId ?? undefined },
            lock: { mode: 'pessimistic_write' },
            loadEagerRelations: false,
          });
          if (!nc?.facturaOriginalId) return;

          // Restaurar CxC: sumar de vuelta nc.total al montoPendiente
          const [cxcRow] = await em.query<any[]>(
            `SELECT id, "montoPendiente", "montoOriginal"
             FROM cuentas_por_cobrar
             WHERE "facturaId" = $1 AND "empresaId" = $2 AND "isActive" = true
             LIMIT 1`,
            [nc.facturaOriginalId, ecf.empresaId],
          );
          if (cxcRow) {
            const montoOriginal     = +Number(cxcRow.montoOriginal).toFixed(2);
            const montoPendienteOld = +Number(cxcRow.montoPendiente).toFixed(2);
            const ncTotal           = +Number(nc.total).toFixed(2);
            const montoPendienteNew = +Math.min(montoOriginal, montoPendienteOld + ncTotal).toFixed(2);
            const montoPagadoNew    = +Math.max(0, montoOriginal - montoPendienteNew).toFixed(2);
            const estadoNew = montoPendienteNew <= 0 ? 'pagada'
                            : montoPagadoNew   >  0 ? 'pagada_parcial'
                            : 'pendiente';
            await em.query(
              `UPDATE cuentas_por_cobrar
               SET "montoPendiente" = $1, "montoPagado" = $2, estado = $3
               WHERE id = $4`,
              [montoPendienteNew, montoPagadoNew, estadoNew, cxcRow.id],
            );
          }
          await em.getRepository(NotaCredito).update(
            { id: nc.id, empresaId: ecf.empresaId ?? undefined },
            { estado: EstadoNotaCredito.ANULADA },
          );
          this.logger.warn(
            `[EcfEfectosNc] NC ${ecf.numero} codigoMod=3 RECHAZADA → ` +
            `CxC de Factura #${nc.facturaOriginalId} revertida. NC #${nc.id} marcada ANULADA.`,
          );
        });
      } catch (err) {
        reportServiceError(err, 'ecf_efectos_nc_codigomod3_rechazado', {
          ecfId:             ecf.id,
          numero:            ecf.numero,
          empresaId:         String(ecf.empresaId ?? ''),
          documentoOrigenId: String(ecf.documentoOrigenId ?? ''),
        });
        throw err;
      }
      return;
    }

    if (ecf.codigoModificacion !== 1) return;

    try {
      await this.dataSource.transaction(async (em) => {
        // Lock pesimista: si webhook y cron consultan simultáneamente solo uno
        // procede; el segundo ve efectosAplicados=true y sale sin duplicar efectos.
        // loadEagerRelations:false evita los LEFT JOIN de cliente/detalles (eager:true
        // en la entidad), que harían fallar el FOR UPDATE de Postgres con outer joins.
        // Solo necesitamos columnas escalares (facturaOriginalId, efectosAplicados, id).
        const nc = await em.getRepository(NotaCredito).findOne({
          where: { id: ecf.documentoOrigenId, empresaId: ecf.empresaId ?? undefined },
          lock: { mode: 'pessimistic_write' },
          loadEagerRelations: false,
        });
        if (!nc?.facturaOriginalId) return;

        if (nuevoEstado === EstadoDGII.CONTINGENCIA) {
          // Sin respuesta de DGII tras timeout — liberar la factura para no
          // bloquearla indefinidamente. El usuario debe verificar en portal DGII.
          await em.getRepository(Factura).update(
            { id: nc.facturaOriginalId, empresaId: ecf.empresaId ?? undefined },
            { anulacionPendiente: false },
          );
          this.logger.warn(
            `[EcfEfectosNc] NC ${ecf.numero} → CONTINGENCIA — ` +
            `anulacionPendiente liberado en Factura #${nc.facturaOriginalId}. Verificar portal DGII.`,
          );
          return;
        }

        if (nuevoEstado === EstadoDGII.ACEPTADO || nuevoEstado === EstadoDGII.OBSERVADO) {
          if (nc.efectosAplicados) return; // idempotencia garantizada con lock
          await em.getRepository(Factura).update(
            { id: nc.facturaOriginalId, empresaId: ecf.empresaId ?? undefined },
            { estado: FacturaEstado.CANCELADA, anulacionPendiente: false },
          );
          await em.getRepository(NotaCredito).update(
            { id: nc.id, empresaId: ecf.empresaId ?? undefined },
            { efectosAplicados: true },
          );
          this.logger.log(
            `[EcfEfectosNc] ${ecf.numero} ${nuevoEstado} → Factura #${nc.facturaOriginalId} CANCELADA definitivamente`,
          );
          if (nuevoEstado === EstadoDGII.OBSERVADO) {
            this.logger.warn(`[EcfEfectosNc] NC ${ecf.numero} OBSERVADA — revisar observaciones en portal DGII`);
          }
        } else if (nuevoEstado === EstadoDGII.RECHAZADO) {
          await em.getRepository(Factura).update(
            { id: nc.facturaOriginalId, empresaId: ecf.empresaId ?? undefined },
            { anulacionPendiente: false },
          );
          await em.getRepository(NotaCredito).update(
            { id: nc.id, empresaId: ecf.empresaId ?? undefined },
            { estado: EstadoNotaCredito.ANULADA, efectosAplicados: false },
          );
          this.logger.warn(
            `[EcfEfectosNc] NC ${ecf.numero} RECHAZADA → Factura #${nc.facturaOriginalId} restaurada (vigente). ` +
            `NC #${nc.id} marcada ANULADA.`,
          );
        }
      });
    } catch (err) {
      // TIPO A (efecto de dinero): reportar a Sentry y PROPAGAR. El caller NO debe
      // sellar el estado definitivo del e-CF cuando su efecto falló — así el cron lo
      // reintenta en la próxima pasada, en vez de dejar la factura en estado
      // inconsistente (cancelada-a-medias o anulacionPendiente colgado) para siempre.
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
