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
    const [row] = await this.ds.query<any[]>(
      `SELECT * FROM pr_pagos WHERE id=$1 AND "empresaId"=$2`, [id, empresaId],
    );
    if (!row) throw new NotFoundException(`Pago #${id} no encontrado`);
    return row;
  }

  async registrar(empresaId: number, data: any) {
    const [prestamo] = await this.ds.query<any[]>(
      `SELECT * FROM pr_prestamos WHERE id=$1 AND "empresaId"=$2`, [data.prestamoId, empresaId],
    );
    if (!prestamo) throw new NotFoundException(`Préstamo #${data.prestamoId} no encontrado`);
    if (prestamo.estado === 'cancelado' || prestamo.estado === 'pagado') {
      throw new BadRequestException('El préstamo ya está cerrado');
    }

    const cuotas = await this.ds.query<any[]>(
      `SELECT * FROM pr_cuotas WHERE "prestamoId"=$1 AND estado<>'pagada' ORDER BY "numeroCuota"`,
      [data.prestamoId],
    );

    let restante = this.r2(Number(data.montoPagado));
    let aplicadoMora = 0;
    let aplicadoInteres = 0;
    let aplicadoCapital = 0;
    const cuotasAfectadas: any[] = [];

    for (const cuota of cuotas) {
      if (restante <= 0) break;

      // Orden: mora → interés → capital
      let moraPend = this.r2(Number(cuota.moraGenerada) - Number(cuota.moraPagada));
      let intPend  = this.r2(Number(cuota.interes) - Number(cuota.interesPagado));
      let capPend  = this.r2(Number(cuota.capital) - Number(cuota.capitalPagado));

      let pagMora  = 0; let pagInt = 0; let pagCap = 0;

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

      const estCuota = nuevaCapPag >= Number(cuota.capital) && nuevaIntPag >= Number(cuota.interes)
        ? 'pagada' : 'parcial';

      await this.ds.query(
        `UPDATE pr_cuotas SET "interesPagado"=$1,"capitalPagado"=$2,"moraPagada"=$3,"totalPagado"=$4,
          estado=$5,"fechaPago"=CURRENT_DATE WHERE id=$6`,
        [nuevaIntPag, nuevaCapPag, nuevaMoraPag, nuevaTotal, estCuota, cuota.id],
      );

      cuotasAfectadas.push({ cuotaId: cuota.id, numeroCuota: cuota.numeroCuota,
        pagMora, pagInt, pagCap, estado: estCuota });
    }

    // Generar número de pago
    const [seq] = await this.ds.query<any[]>(
      `SELECT siguiente_numero_secuencia($1, $2) AS num`, [empresaId, 'PAG'],
    );
    const numero = `PAG-${seq.num}`;

    const [pago] = await this.ds.query<any[]>(
      `INSERT INTO pr_pagos ("empresaId",numero,"prestamoId","deudorId","montoPagado","aplicadoMora",
        "aplicadoInteres","aplicadoCapital","metodoPago",referencia,"cobradorId","cobradorNombre",
        "cuotasAfectadas",notas)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
      [empresaId, numero, data.prestamoId, prestamo.deudorId, data.montoPagado,
       aplicadoMora, aplicadoInteres, aplicadoCapital,
       data.metodoPago ?? null, data.referencia ?? null, data.cobradorId ?? null,
       data.cobradorNombre ?? null, JSON.stringify(cuotasAfectadas), data.notas ?? null],
    );

    // Recalcular saldos del préstamo
    const saldos = await this.ds.query<any[]>(
      `SELECT
         SUM(GREATEST(0, capital - "capitalPagado")) AS saldoCapital,
         SUM(GREATEST(0, interes - "interesPagado")) AS saldoInteres,
         SUM(GREATEST(0, "moraGenerada" - "moraPagada")) AS saldoMora,
         COUNT(*) FILTER (WHERE estado <> 'pagada' AND "fechaVencimiento" < CURRENT_DATE) AS cuotasVencidas
       FROM pr_cuotas WHERE "prestamoId"=$1`,
      [data.prestamoId],
    );
    const s = saldos[0];
    const saldoCapital  = this.r2(Number(s.saldoCapital  ?? 0));
    const saldoInteres  = this.r2(Number(s.saldoInteres  ?? 0));
    const saldoMora     = this.r2(Number(s.saldoMora     ?? 0));
    const saldoTotal    = this.r2(saldoCapital + saldoInteres + saldoMora);
    const cuotasVencidas = Number(s.cuotasVencidas ?? 0);
    const nuevoEstado   = saldoCapital <= 0 ? 'pagado' : cuotasVencidas > 0 ? 'moroso' : 'al_dia';
    const totalPagado   = this.r2(Number(prestamo.totalPagado) + Number(data.montoPagado));

    await this.ds.query(
      `UPDATE pr_prestamos SET "saldoCapital"=$1,"saldoInteres"=$2,"saldoMora"=$3,"saldoTotal"=$4,
        "totalPagado"=$5,"cuotasVencidas"=$6,estado=$7,"updatedAt"=NOW() WHERE id=$8`,
      [saldoCapital, saldoInteres, saldoMora, saldoTotal, totalPagado, cuotasVencidas, nuevoEstado, data.prestamoId],
    );

    if (nuevoEstado === 'pagado') {
      await this.ds.query(
        `UPDATE pr_deudores SET "totalPagado"="totalPagado"+$1,"prestamosActivos"=GREATEST(0,"prestamosActivos"-1),
          "updatedAt"=NOW() WHERE id=$2 AND "empresaId"=$3`,
        [data.montoPagado, prestamo.deudorId, empresaId],
      );
    } else {
      await this.ds.query(
        `UPDATE pr_deudores SET "totalPagado"="totalPagado"+$1,"updatedAt"=NOW() WHERE id=$2 AND "empresaId"=$3`,
        [data.montoPagado, prestamo.deudorId, empresaId],
      );
    }

    // Asiento contable fire-and-forget
    this.asientos.asientoPagoPrestamo(
      pago.id, numero, prestamo.numero,
      data.metodoPago ?? 'transferencia',
      aplicadoCapital, aplicadoInteres, aplicadoMora,
      data.userId ?? 0,
    ).catch(err => this.logger.error(`Asiento pago ${numero}: ${err.message}`));

    // e-CF fire-and-forget — solo si hay interés gravable
    if (aplicadoInteres > 0) {
      this.emitirEcf.execute({
        empresaId,
        documentoOrigenTipo: DocumentoOrigenTipo.PAGO_PRESTAMO,
        documentoOrigenId:   pago.id,
        tipoEcf:             32,  // Factura de Consumo
      }).catch(err => this.logger.warn(`ECF interés pago ${numero}: ${err.message}`));
    }

    return { pago, cuotasAfectadas, saldos: { saldoCapital, saldoInteres, saldoMora, saldoTotal } };
  }
}
