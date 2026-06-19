import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { calcularAmortizacion } from '../utils/amortizacion.util';

@Injectable()
export class PrestamosService {
  private readonly logger = new Logger(PrestamosService.name);

  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  private async orFail(empresaId: number, id: number) {
    const [row] = await this.ds.query<any[]>(
      `SELECT p.*, d.nombre as deudorNombre, d.cedula as deudorCedula, d.telefono as deudorTelefono
       FROM pr_prestamos p JOIN pr_deudores d ON d.id=p."deudorId"
       WHERE p.id=$1 AND p."empresaId"=$2`, [id, empresaId],
    );
    if (!row) throw new NotFoundException(`Préstamo #${id} no encontrado`);
    return row;
  }

  async findAll(empresaId: number, params: any) {
    const page  = Math.max(1, Number(params.page)  || 1);
    const limit = Math.min(100, Number(params.limit) || 20);
    const offset = (page - 1) * limit;
    const conds: string[] = [`p."empresaId"=$1`];
    const args: any[] = [empresaId];
    let idx = 2;
    if (params.estado) { conds.push(`p.estado=$${idx++}`); args.push(params.estado); }
    if (params.deudorId) { conds.push(`p."deudorId"=$${idx++}`); args.push(params.deudorId); }
    if (params.search) {
      conds.push(`(d.nombre ILIKE $${idx} OR d.cedula ILIKE $${idx} OR p.numero ILIKE $${idx})`);
      args.push(`%${params.search}%`); idx++;
    }
    const where = conds.join(' AND ');
    const [{ count }] = await this.ds.query(
      `SELECT COUNT(*) FROM pr_prestamos p JOIN pr_deudores d ON d.id=p."deudorId" WHERE ${where}`, args,
    );
    const data = await this.ds.query(
      `SELECT p.*, d.nombre as deudorNombre, d.cedula as deudorCedula
       FROM pr_prestamos p JOIN pr_deudores d ON d.id=p."deudorId"
       WHERE ${where} ORDER BY p."createdAt" DESC LIMIT $${idx} OFFSET $${idx + 1}`,
      [...args, limit, offset],
    );
    return { data, total: Number(count), page, limit };
  }

  async findOne(empresaId: number, id: number) {
    const prestamo = await this.orFail(empresaId, id);
    const cuotas = await this.ds.query(
      `SELECT * FROM pr_cuotas WHERE "prestamoId"=$1 ORDER BY "numeroCuota"`, [id],
    );
    const pagos = await this.ds.query(
      `SELECT * FROM pr_pagos WHERE "prestamoId"=$1 ORDER BY fecha DESC`, [id],
    );
    return { ...prestamo, cuotas, pagos };
  }

  async simular(data: any) {
    const { principal, tasaInteresMensual, plazoMeses, fechaPrimerPago, metodoAmortizacion } = data;
    if (!principal || !tasaInteresMensual || !plazoMeses || !fechaPrimerPago) {
      throw new BadRequestException('Faltan parámetros de simulación');
    }
    const fecha = new Date(fechaPrimerPago);
    return calcularAmortizacion(
      metodoAmortizacion ?? 'frances',
      Number(principal),
      Number(tasaInteresMensual),
      Number(plazoMeses),
      fecha,
    );
  }

  async create(empresaId: number, data: any) {
    const [seq] = await this.ds.query<any[]>(
      `SELECT siguiente_numero_secuencia($1, $2) AS num`, [empresaId, 'PRE'],
    );
    const numero = `PRE-${seq.num}`;

    const fechaPrimerPago = new Date(data.fechaPrimerPago);
    const amort = calcularAmortizacion(
      data.metodoAmortizacion ?? 'frances',
      Number(data.montoPrincipal),
      Number(data.tasaInteresMensual),
      Number(data.plazoMeses),
      fechaPrimerPago,
    );

    const ultimaCuota = amort.tabla[amort.tabla.length - 1];

    const [prestamo] = await this.ds.query<any[]>(
      `INSERT INTO pr_prestamos ("empresaId",numero,"solicitudId","deudorId","productoId","montoPrincipal",
        "tasaInteresMensual","plazoMeses","frecuenciaPago","metodoAmortizacion","cuotaPeriodica",
        "porcentajeMora","diasGracia","cargoCierre","fechaDesembolso","fechaPrimerPago","fechaVencimiento",
        "totalInteres","totalAPagar","saldoCapital","saldoInteres","saldoTotal","oficialId","oficialNombre",notas)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25)
       RETURNING *`,
      [empresaId, numero, data.solicitudId ?? null, data.deudorId, data.productoId ?? null,
       data.montoPrincipal, data.tasaInteresMensual, data.plazoMeses, data.frecuenciaPago ?? 'mensual',
       data.metodoAmortizacion ?? 'frances', amort.cuotaFija,
       data.porcentajeMora ?? 0, data.diasGracia ?? 0, data.cargoCierre ?? 0,
       data.fechaDesembolso, data.fechaPrimerPago, ultimaCuota.fechaVencimiento.toISOString().split('T')[0],
       amort.totalInteres, amort.totalAPagar,
       data.montoPrincipal, amort.totalInteres, amort.totalAPagar,
       data.oficialId ?? null, data.oficialNombre ?? null, data.notas ?? null],
    );

    // Insertar cuotas
    for (const linea of amort.tabla) {
      await this.ds.query(
        `INSERT INTO pr_cuotas ("empresaId","prestamoId","numeroCuota","fechaVencimiento",capital,interes,"cuotaTotal","saldoRestante")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [empresaId, prestamo.id, linea.numeroCuota, linea.fechaVencimiento.toISOString().split('T')[0],
         linea.capital, linea.interes, linea.cuotaTotal, linea.saldoRestante],
      );
    }

    // Actualizar estadísticas del deudor
    await this.ds.query(
      `UPDATE pr_deudores SET "totalPrestado"="totalPrestado"+$1,"prestamosActivos"="prestamosActivos"+1,"updatedAt"=NOW()
       WHERE id=$2 AND "empresaId"=$3`,
      [data.montoPrincipal, data.deudorId, empresaId],
    );

    // Marcar solicitud como desembolsada si viene de una
    if (data.solicitudId) {
      await this.ds.query(
        `UPDATE pr_solicitudes SET estado='desembolsada' WHERE id=$1 AND "empresaId"=$2`,
        [data.solicitudId, empresaId],
      );
    }

    return this.findOne(empresaId, prestamo.id);
  }

  async cancelar(empresaId: number, id: number, motivo?: string) {
    const p = await this.orFail(empresaId, id);
    if (p.estado === 'cancelado') throw new BadRequestException('Préstamo ya cancelado');
    await this.ds.query(
      `UPDATE pr_prestamos SET estado='cancelado', notas=CONCAT(COALESCE(notas,''), ' | Cancelado: ', $1), "updatedAt"=NOW()
       WHERE id=$2 AND "empresaId"=$3`,
      [motivo ?? 'Sin motivo', id, empresaId],
    );
    await this.ds.query(
      `UPDATE pr_deudores SET "prestamosActivos"=GREATEST(0,"prestamosActivos"-1),"updatedAt"=NOW()
       WHERE id=$1 AND "empresaId"=$2`,
      [p.deudorId, empresaId],
    );
    return { success: true };
  }
}
