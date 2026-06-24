import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ECF, DocumentoOrigenTipo, EstadoDGII } from '../entities/ecf.entity';
import { Factura, FacturaEstado } from '../../facturas/entities/factura.entity';
import { NotaCredito, EstadoNotaCredito } from '../../notas-credito/entities/nota-credito.entity';

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
    if (ecf.codigoModificacion !== 1) return;

    const estadosAccionables = [
      EstadoDGII.ACEPTADO,
      EstadoDGII.RECHAZADO,
      EstadoDGII.OBSERVADO,
      EstadoDGII.CONTINGENCIA,
    ];
    if (!estadosAccionables.includes(nuevoEstado)) return;

    await this.dataSource.transaction(async (em) => {
      // Lock pesimista: si webhook y cron consultan simultáneamente solo uno
      // procede; el segundo ve efectosAplicados=true y sale sin duplicar efectos.
      const nc = await em.getRepository(NotaCredito).findOne({
        where: { id: ecf.documentoOrigenId, empresaId: ecf.empresaId ?? undefined },
        lock: { mode: 'pessimistic_write' },
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
  }
}
