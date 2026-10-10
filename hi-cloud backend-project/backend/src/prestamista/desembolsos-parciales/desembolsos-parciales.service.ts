import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AsientosAutomaticosService } from '../../contabilidad/services/asientos-automaticos.service';
import { PrestamosService } from '../prestamos/prestamos.service';
import { r2 } from '../utils/mora.util';

/**
 * Tramos de efectivo entregados a un préstamo que nació en
 * 'desembolso_parcial' (Etapa 2 resto, §4) — ver
 * docs/prestamista/etapa-2-resto.md. La tabla de amortización no cambia
 * nunca aquí: ya se generó completa al crear el préstamo.
 */
@Injectable()
export class DesembolsosParcialesService {
  private readonly logger = new Logger(DesembolsosParcialesService.name);

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly asientos: AsientosAutomaticosService,
    private readonly prestamosSvc: PrestamosService,
  ) {}

  async findByPrestamo(empresaId: number, prestamoId: number) {
    return this.ds.query(
      `SELECT * FROM pr_desembolsos_parciales WHERE "prestamoId"=$1 AND "empresaId"=$2 ORDER BY fecha, id`,
      [prestamoId, empresaId],
    );
  }

  async registrar(empresaId: number, data: any, usuario: { id: number; nombre?: string }) {
    const qr = this.ds.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const [prestamo] = await qr.query(
        `SELECT * FROM pr_prestamos WHERE id=$1 AND "empresaId"=$2 FOR UPDATE`, [data.prestamoId, empresaId],
      );
      if (!prestamo) throw new NotFoundException(`Préstamo #${data.prestamoId} no encontrado`);
      if (prestamo.estado !== 'desembolso_parcial') {
        throw new BadRequestException('Este préstamo no tiene un desembolso pendiente por completar');
      }

      const monto = r2(Number(data.monto));
      const desembolsadoActual = r2(Number(prestamo.desembolsado));
      const montoPrincipal = r2(Number(prestamo.montoPrincipal));
      const restante = r2(montoPrincipal - desembolsadoActual);
      if (monto > restante) {
        throw new BadRequestException(`El tramo excede lo que falta por desembolsar (RD$ ${restante.toFixed(2)})`);
      }

      const [tramo] = await qr.query(
        `INSERT INTO pr_desembolsos_parciales ("empresaId","prestamoId",monto,fecha,"metodoPago",notas,"creadoPor")
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [empresaId, prestamo.id, monto, data.fecha, data.metodoPago ?? null, data.notas ?? null, usuario.id],
      );

      const nuevoDesembolsado = r2(desembolsadoActual + monto);
      const completo = nuevoDesembolsado >= montoPrincipal;
      await qr.query(
        `UPDATE pr_prestamos SET "desembolsado"=$1, estado=$2, "updatedAt"=NOW() WHERE id=$3 AND "empresaId"=$4`,
        [nuevoDesembolsado, completo ? 'al_dia' : 'desembolso_parcial', prestamo.id, empresaId],
      );

      await qr.commitTransaction();

      // Fire-and-forget después del commit — mismo patrón que
      // PrestamosService.create() y PagosService.anular().
      this.asientos.asientoDesembolsoPrestamo(
        prestamo.id, prestamo.numero, monto, data.metodoPago ?? 'transferencia', data.fecha,
        usuario.id, 0,
      ).catch(err => this.logger.error(`Asiento tramo desembolso ${prestamo.numero}: ${err.message}`));

      if (completo) {
        this.prestamosSvc.recalcularSaldos(empresaId, prestamo.id)
          .catch(err => this.logger.error(`Recalcular saldos tras completar desembolso ${prestamo.numero}: ${err.message}`));
      }

      this.logger.log(`Tramo de RD$ ${monto.toFixed(2)} registrado en préstamo ${prestamo.numero} por ${usuario.nombre ?? `usuario #${usuario.id}`}${completo ? ' — desembolso COMPLETO' : ''}`);
      return { tramo, desembolsado: nuevoDesembolsado, montoPrincipal, completo };
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }
  }
}
