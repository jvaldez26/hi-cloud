import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
 */
@Injectable()
export class EcfEfectosNcService {
  private readonly logger = new Logger(EcfEfectosNcService.name);

  constructor(
    @InjectRepository(Factura)
    private readonly facturaRepo: Repository<Factura>,

    @InjectRepository(NotaCredito)
    private readonly ncRepo: Repository<NotaCredito>,
  ) {}

  async aplicarEfectosPorEstado(ecf: ECF, nuevoEstado: EstadoDGII): Promise<void> {
    if (ecf.documentoOrigenTipo !== DocumentoOrigenTipo.NOTA_CREDITO) return;
    if (ecf.codigoModificacion !== 1) return;

    const estadosDefinitivos = [EstadoDGII.ACEPTADO, EstadoDGII.RECHAZADO, EstadoDGII.OBSERVADO];
    if (!estadosDefinitivos.includes(nuevoEstado)) return;

    const nc = await this.ncRepo.findOne({
      where: { id: ecf.documentoOrigenId, empresaId: ecf.empresaId ?? undefined },
    });
    if (!nc?.facturaOriginalId) return;

    if (nuevoEstado === EstadoDGII.ACEPTADO || nuevoEstado === EstadoDGII.OBSERVADO) {
      if (nc.efectosAplicados) return; // idempotencia
      await this.facturaRepo.update(
        { id: nc.facturaOriginalId, empresaId: ecf.empresaId ?? undefined },
        { estado: FacturaEstado.CANCELADA, anulacionPendiente: false },
      );
      await this.ncRepo.update(
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
      // Revertir estado provisional y marcar NC como anulada
      await this.facturaRepo.update(
        { id: nc.facturaOriginalId, empresaId: ecf.empresaId ?? undefined },
        { anulacionPendiente: false },
      );
      await this.ncRepo.update(
        { id: nc.id, empresaId: ecf.empresaId ?? undefined },
        { estado: EstadoNotaCredito.ANULADA, efectosAplicados: false },
      );
      this.logger.warn(
        `[EcfEfectosNc] NC ${ecf.numero} RECHAZADA → Factura #${nc.facturaOriginalId} restaurada (vigente). ` +
        `NC #${nc.id} marcada ANULADA.`,
      );
    }
  }
}
