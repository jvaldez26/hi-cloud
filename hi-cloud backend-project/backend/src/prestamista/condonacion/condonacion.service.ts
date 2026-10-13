import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, QueryRunner } from 'typeorm';
import { AsientosAutomaticosService } from '../../contabilidad/services/asientos-automaticos.service';
import { PrestamosService } from '../prestamos/prestamos.service';
import { fechaHoyRD } from '../../common/utils/fecha-local.util';
import { r2 } from '../utils/mora.util';

/**
 * Condonación independiente (Etapa 2 resto, §6) — perdona mora y/o interés
 * pendiente de un préstamo VIVO, sin refinanciarlo (a diferencia de
 * `RefinanciamientoService.refinanciar()`, que siempre cierra el préstamo).
 * Capital NUNCA se condona aquí — perdonar capital es perdonar deuda real,
 * fuera de alcance de este cambio (ver docs/prestamista/etapa-2-resto.md §6).
 */
@Injectable()
export class CondonacionService {
  private readonly logger = new Logger(CondonacionService.name);

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly asientos: AsientosAutomaticosService,
    private readonly prestamosSvc: PrestamosService,
  ) {}

  async condonar(empresaId: number, prestamoId: number, data: any, usuario: { id: number; nombre?: string }) {
    const qr = this.ds.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const resultado = await this.condonarEnTransaccion(qr, empresaId, prestamoId, data, usuario);
      await qr.commitTransaction();

      if (resultado.moraCondonada > 0 || resultado.interesCondonado > 0) {
        this.asientos.asientoCondonacionPrestamo(
          prestamoId, resultado.numero, resultado.moraCondonada, resultado.interesCondonado,
          fechaHoyRD(), usuario.id,
        ).catch(err => this.logger.error(`Asiento condonación ${resultado.numero}: ${err.message}`));
        this.prestamosSvc.recalcularSaldos(empresaId, prestamoId)
          .catch(err => this.logger.error(`Recalcular saldos tras condonar ${resultado.numero}: ${err.message}`));
      }

      this.logger.log(
        `Préstamo #${prestamoId}: condonados RD$ ${resultado.moraCondonada.toFixed(2)} de mora y ` +
        `RD$ ${resultado.interesCondonado.toFixed(2)} de interés por ${usuario.nombre ?? `usuario #${usuario.id}`} — ${data.motivo}`,
      );
      return resultado;
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }
  }

  private async condonarEnTransaccion(qr: QueryRunner, empresaId: number, prestamoId: number, data: any, usuario: { id: number; nombre?: string }) {
    const presupuestoMora = r2(Number(data.moraACondonar ?? 0));
    const presupuestoInteres = r2(Number(data.interesACondonar ?? 0));
    if (presupuestoMora <= 0 && presupuestoInteres <= 0) {
      throw new BadRequestException('Indica un monto de mora o interés a condonar');
    }

    const [prestamo] = await qr.query(
      `SELECT * FROM pr_prestamos WHERE id=$1 AND "empresaId"=$2 FOR UPDATE`, [prestamoId, empresaId],
    );
    if (!prestamo) throw new NotFoundException(`Préstamo #${prestamoId} no encontrado`);
    if (['cancelado', 'pagado', 'refinanciado'].includes(prestamo.estado)) {
      throw new BadRequestException(`No se puede condonar un préstamo en estado "${prestamo.estado}"`);
    }
    if (prestamo.estado === 'desembolso_parcial') {
      throw new BadRequestException('Este préstamo tiene desembolso pendiente — complétalo antes de condonar');
    }

    const pendientesOrdenadas: any[] = await qr.query(
      `SELECT * FROM pr_cuotas WHERE "prestamoId"=$1 AND estado<>'pagada' ORDER BY "numeroCuota" FOR UPDATE`,
      [prestamoId],
    );

    let restanteMora = presupuestoMora;
    let restanteInteres = presupuestoInteres;
    let moraCondonadaTotal = 0;
    let interesCondonadoTotal = 0;

    for (const c of pendientesOrdenadas) {
      if (restanteMora <= 0 && restanteInteres <= 0) break;

      const moraPendiente = Math.max(0, r2(Number(c.moraGenerada) - Number(c.moraPagada)));
      const interesPendiente = Math.max(0, r2(Number(c.interes) - Number(c.interesPagado)));
      const aplicarMora = Math.min(moraPendiente, restanteMora);
      const aplicarInteres = Math.min(interesPendiente, restanteInteres);
      if (aplicarMora <= 0 && aplicarInteres <= 0) continue;

      const nuevaMoraPagada = r2(Number(c.moraPagada) + aplicarMora);
      const nuevaMoraCondonada = r2(Number(c.moraCondonada) + aplicarMora);
      const nuevoInteresPagado = r2(Number(c.interesPagado) + aplicarInteres);
      const nuevoInteresCondonado = r2(Number(c.interesCondonado) + aplicarInteres);
      // El capital nunca se condona (fuera de alcance, §6) — una cuota
      // tocada aquí siempre queda 'parcial', nunca 'pagada', porque viene
      // de la lista de cuotas con estado<>'pagada' y su capital no se mueve.
      await qr.query(
        `UPDATE pr_cuotas SET "moraPagada"=$1,"moraCondonada"=$2,"interesPagado"=$3,"interesCondonado"=$4,estado='parcial' WHERE id=$5`,
        [nuevaMoraPagada, nuevaMoraCondonada, nuevoInteresPagado, nuevoInteresCondonado, c.id],
      );

      restanteMora = r2(restanteMora - aplicarMora);
      restanteInteres = r2(restanteInteres - aplicarInteres);
      moraCondonadaTotal = r2(moraCondonadaTotal + aplicarMora);
      interesCondonadoTotal = r2(interesCondonadoTotal + aplicarInteres);
    }

    if (moraCondonadaTotal <= 0 && interesCondonadoTotal <= 0) {
      throw new BadRequestException('No hay mora ni interés pendiente para condonar en este préstamo');
    }

    await qr.query(
      `UPDATE pr_prestamos SET notas=CONCAT(COALESCE(notas,''), ' | Condonación: ', $1), "updatedAt"=NOW()
       WHERE id=$2 AND "empresaId"=$3`,
      [data.motivo, prestamoId, empresaId],
    );

    return {
      numero: prestamo.numero,
      moraCondonada: moraCondonadaTotal,
      interesCondonado: interesCondonadoTotal,
      moraSolicitadaNoAplicada: r2(presupuestoMora - moraCondonadaTotal),
      interesSolicitadoNoAplicado: r2(presupuestoInteres - interesCondonadoTotal),
    };
  }
}
