import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AsientosAutomaticosService } from '../../contabilidad/services/asientos-automaticos.service';
import { EmitirECFUseCase } from '../../ecf/use-cases/emitir-ecf.use-case';
import { DocumentoOrigenTipo } from '../../ecf/entities/ecf.entity';

@Injectable()
export class PagosService {
  private readonly logger = new Logger(PagosService.name);

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly asientos: AsientosAutomaticosService,
    private readonly emitirEcf: EmitirECFUseCase,
  ) {}

  private r2(n: number) { return Math.round(Number(n) * 100) / 100; }

  async findByPrestamo(empresaId: number, prestamoId: number) {
    return this.ds.query(
      `SELECT * FROM pr_pagos WHERE "prestamoId"=$1 AND "empresaId"=$2 ORDER BY fecha DESC`,
      [prestamoId, empresaId],
    );
  }

  async findOne(empresaId: number, id: number) {
    const rows: any[] = await this.ds.query(
      `SELECT * FROM pr_pagos WHERE id=$1 AND "empresaId"=$2`, [id, empresaId],
    );
    if (!rows[0]) throw new NotFoundException(`Pago #${id} no encontrado`);
    return rows[0];
  }

  async registrar(empresaId: number, data: any) {
    const prestamoRows: any[] = await this.ds.query(
      `SELECT * FROM pr_prestamos WHERE id=$1 AND "empresaId"=$2`, [data.prestamoId, empresaId],
    );
    const prestamo = prestamoRows[0];
    if (!prestamo) throw new NotFoundException(`Préstamo #${data.prestamoId} no encontrado`);
    if (prestamo.estado === 'cancelado' || prestamo.estado === 'pagado') {
      throw new BadRequestException('El préstamo ya está cerrado');
    }

    // Variables declaradas fuera del try para que sean accesibles en el fire-and-forget
    let pago: any;
    let numero = '';
    let aplicadoMora = 0;
    let aplicadoInteres = 0;
    let aplicadoCapital = 0;
    const cuotasAfectadas: any[] = [];
    let saldoCapital = 0;
    let saldoInteres = 0;
    let saldoMora = 0;
    let saldoTotal = 0;

    const qr = this.ds.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
      const cuotas: any[] = await qr.query(
        `SELECT * FROM pr_cuotas WHERE "prestamoId"=$1 AND estado<>'pagada' ORDER BY "numeroCuota"`,
        [data.prestamoId],
      );

      let restante = this.r2(Number(data.montoPagado));

      for (const cuota of cuotas) {
        if (restante <= 0) break;

        // Orden: mora → interés → capital
        const moraPend = this.r2(Number(cuota.moraGenerada) - Number(cuota.moraPagada));
        const intPend  = this.r2(Number(cuota.interes)      - Number(cuota.interesPagado));
        const capPend  = this.r2(Number(cuota.capital)      - Number(cuota.capitalPagado));

        // Guard: cuota sin pendiente real (datos corruptos o ya saldada)
        if (moraPend <= 0 && intPend <= 0 && capPend <= 0) continue;

        let pagMora = 0; let pagInt = 0; let pagCap = 0;

        if (moraPend > 0 && restante > 0) {
          pagMora = Math.min(moraPend, restante);
          aplicadoMora = this.r2(aplicadoMora + pagMora);
          restante = this.r2(restante - pagMora);
        }
        if (intPend > 0 && restante > 0) {
          pagInt = Math.min(intPend, restante);
          aplicadoInteres = this.r2(aplicadoInteres + pagInt);
          restante = this.r2(restante - pagInt);
        }
        if (capPend > 0 && restante > 0) {
          pagCap = Math.min(capPend, restante);
          aplicadoCapital = this.r2(aplicadoCapital + pagCap);
          restante = this.r2(restante - pagCap);
        }

        const totalPagadoCuota = this.r2(pagMora + pagInt + pagCap);
        if (totalPagadoCuota === 0) continue;

        const nuevaIntPag  = this.r2(Number(cuota.interesPagado) + pagInt);
        const nuevaCapPag  = this.r2(Number(cuota.capitalPagado) + pagCap);
        const nuevaMoraPag = this.r2(Number(cuota.moraPagada) + pagMora);
        const nuevaTotal   = this.r2(Number(cuota.totalPagado) + totalPagadoCuota);

        const cuotaPagada = nuevaCapPag >= Number(cuota.capital) && nuevaIntPag >= Number(cuota.interes);
        const estCuota = cuotaPagada ? 'pagada' : 'parcial';

        await qr.query(
          `UPDATE pr_cuotas SET "interesPagado"=$1,"capitalPagado"=$2,"moraPagada"=$3,"totalPagado"=$4,
            estado=$5,"fechaPago"=CURRENT_DATE WHERE id=$6`,
          [nuevaIntPag, nuevaCapPag, nuevaMoraPag, nuevaTotal, estCuota, cuota.id],
        );

        cuotasAfectadas.push({ cuotaId: cuota.id, numeroCuota: cuota.numeroCuota,
          pagMora, pagInt, pagCap, estado: estCuota });
      }

      // Generar número de pago
      const seqRows: any[] = await qr.query(
        `SELECT siguiente_numero_secuencia($1, $2) AS num`, [empresaId, 'PAG'],
      );
      numero = `PAG-${seqRows[0].num}`;

      const pagoRows: any[] = await qr.query(
        `INSERT INTO pr_pagos ("empresaId",numero,"prestamoId","deudorId","montoPagado","aplicadoMora",
          "aplicadoInteres","aplicadoCapital","metodoPago",referencia,"cobradorId","cobradorNombre",
          "cuotasAfectadas",notas)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
        [empresaId, numero, data.prestamoId, prestamo.deudorId, data.montoPagado,
         aplicadoMora, aplicadoInteres, aplicadoCapital,
         data.metodoPago ?? null, data.referencia ?? null, data.cobradorId ?? null,
         data.cobradorNombre ?? null, JSON.stringify(cuotasAfectadas), data.notas ?? null],
      );
      pago = pagoRows[0];

      // Recalcular saldos del préstamo desde cuotas reales (aliases entre comillas)
      const saldos: any[] = await qr.query(
        `SELECT
           SUM(GREATEST(0, capital - "capitalPagado"))                                        AS "saldoCapital",
           SUM(GREATEST(0, interes - "interesPagado"))                                        AS "saldoInteres",
           SUM(GREATEST(0, "moraGenerada" - "moraPagada"))                                    AS "saldoMora",
           COUNT(*) FILTER (WHERE estado <> 'pagada')                                         AS "cuotasPendientes",
           COUNT(*) FILTER (WHERE estado <> 'pagada' AND "fechaVencimiento" < CURRENT_DATE)   AS "cuotasVencidas"
         FROM pr_cuotas WHERE "prestamoId"=$1`,
        [data.prestamoId],
      );
      const s = saldos[0];
      saldoCapital  = this.r2(Number(s.saldoCapital  ?? 0));
      saldoInteres  = this.r2(Number(s.saldoInteres  ?? 0));
      saldoMora     = this.r2(Number(s.saldoMora     ?? 0));
      saldoTotal    = this.r2(saldoCapital + saldoInteres + saldoMora);
      const cuotasVencidas   = Number(s.cuotasVencidas   ?? 0);
      const cuotasPendientes = Number(s.cuotasPendientes ?? 0);

      // Préstamo pagado SOLO si saldo=0 Y no quedan cuotas pendientes (doble guard)
      const nuevoEstado = (saldoCapital <= 0 && cuotasPendientes === 0)
        ? 'pagado'
        : cuotasVencidas > 0 ? 'moroso' : 'al_dia';
      const totalPagado = this.r2(Number(prestamo.totalPagado) + Number(data.montoPagado));

      await qr.query(
        `UPDATE pr_prestamos SET "saldoCapital"=$1,"saldoInteres"=$2,"saldoMora"=$3,"saldoTotal"=$4,
          "totalPagado"=$5,"cuotasVencidas"=$6,estado=$7,"updatedAt"=NOW() WHERE id=$8`,
        [saldoCapital, saldoInteres, saldoMora, saldoTotal, totalPagado, cuotasVencidas, nuevoEstado, data.prestamoId],
      );

      if (nuevoEstado === 'pagado') {
        await qr.query(
          `UPDATE pr_deudores SET "totalPagado"="totalPagado"+$1,"prestamosActivos"=GREATEST(0,"prestamosActivos"-1),
            "updatedAt"=NOW() WHERE id=$2 AND "empresaId"=$3`,
          [data.montoPagado, prestamo.deudorId, empresaId],
        );
      } else {
        await qr.query(
          `UPDATE pr_deudores SET "totalPagado"="totalPagado"+$1,"updatedAt"=NOW() WHERE id=$2 AND "empresaId"=$3`,
          [data.montoPagado, prestamo.deudorId, empresaId],
        );
      }

      await qr.commitTransaction();
    } catch (e) {
      await qr.rollbackTransaction();
      throw e;
    } finally {
      await qr.release();
    }

    // Fire-and-forget DESPUÉS del commit (fuera de la transacción)
    this.asientos.asientoPagoPrestamo(
      pago.id, numero, prestamo.numero,
      data.metodoPago ?? 'transferencia',
      aplicadoCapital, aplicadoInteres, aplicadoMora,
      data.userId ?? 0,
    ).catch(err => this.logger.error(`Asiento pago ${numero}: ${err.message}`));

    if (aplicadoInteres > 0) {
      this.emitirEcf.execute({
        empresaId,
        documentoOrigenTipo: DocumentoOrigenTipo.PAGO_PRESTAMO,
        documentoOrigenId:   pago.id,
        tipoEcf:             32,
      }).catch(err => this.logger.warn(`ECF interés pago ${numero}: ${err.message}`));
    }

    return { pago, cuotasAfectadas, saldos: { saldoCapital, saldoInteres, saldoMora, saldoTotal } };
  }
}
