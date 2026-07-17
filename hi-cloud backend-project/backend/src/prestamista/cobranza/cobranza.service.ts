import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Injectable()
export class CobranzaService {
  private readonly logger = new Logger(CobranzaService.name);

  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  async carteraVencida(empresaId: number, params: any) {
    const page  = Math.max(1, Number(params.page)  || 1);
    const limit = Math.min(100, Number(params.limit) || 20);
    const offset = (page - 1) * limit;
    const [{ count }] = await this.ds.query(
      `SELECT COUNT(*) FROM pr_prestamos p WHERE p."empresaId"=$1 AND p.estado IN ('moroso','vencido')`,
      [empresaId],
    );
    const data = await this.ds.query(
      `SELECT p.*,
              d.nombre    AS "deudorNombre",
              d.cedula    AS "deudorCedula",
              d.telefono  AS "deudorTelefono",
              d.direccion AS "deudorDireccion"
       FROM pr_prestamos p JOIN pr_deudores d ON d.id=p."deudorId"
       WHERE p."empresaId"=$1 AND p.estado IN ('moroso','vencido')
       ORDER BY p."diasMoraActual" DESC LIMIT $2 OFFSET $3`,
      [empresaId, limit, offset],
    );
    return { data, total: Number(count), page, limit };
  }

  async gestionesByPrestamo(empresaId: number, prestamoId: number) {
    return this.ds.query(
      `SELECT c.*, u.nombre AS "cobradorNombreU"
       FROM pr_cobranzas c LEFT JOIN usuarios u ON u.id=c."cobradorId"
       WHERE c."prestamoId"=$1 AND c."empresaId"=$2 ORDER BY c.fecha DESC`,
      [prestamoId, empresaId],
    );
  }

  async registrarGestion(empresaId: number, data: any) {
    const rows: any[] = await this.ds.query(
      `SELECT p.*, d.nombre AS "deudorNombre"
       FROM pr_prestamos p JOIN pr_deudores d ON d.id=p."deudorId"
       WHERE p.id=$1 AND p."empresaId"=$2`, [data.prestamoId, empresaId],
    );
    const prestamo = rows[0];
    if (!prestamo) throw new NotFoundException(`Préstamo #${data.prestamoId} no encontrado`);

    const result: any[] = await this.ds.query(
      `INSERT INTO pr_cobranzas ("empresaId","prestamoId","deudorId","cobradorId","cobradorNombre",
        tipo,resultado,"montoPrometido","fechaPromesaPago",descripcion,"diasMoraAlMomento",
        "saldoAlMomento","proximaGestion")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [empresaId, data.prestamoId, prestamo.deudorId, data.cobradorId ?? null,
       data.cobradorNombre ?? null, data.tipo ?? null, data.resultado ?? null,
       data.montoPrometido ?? null, data.fechaPromesaPago ?? null, data.descripcion,
       prestamo.diasMoraActual ?? 0, prestamo.saldoTotal ?? 0, data.proximaGestion ?? null],
    );
    return result[0];
  }

  async resumenCobranza(empresaId: number) {
    const [stats] = await this.ds.query(
      `SELECT
         COUNT(*) FILTER (WHERE estado = 'moroso')                          AS "totalMorosos",
         COUNT(*) FILTER (WHERE estado = 'vencido')                         AS "totalVencidos",
         COALESCE(SUM("saldoMora")    FILTER (WHERE estado IN ('moroso','vencido')), 0) AS "saldoMoraTotal",
         COALESCE(SUM("saldoCapital") FILTER (WHERE estado IN ('moroso','vencido')), 0) AS "carteraVencidaTotal",
         COUNT(*) FILTER (WHERE estado NOT IN ('pagado','cancelado'))        AS "totalActivos",
         COUNT(*) FILTER (WHERE estado IN ('moroso','vencido'))              AS "totalEnMora",
         COALESCE(
           ROUND(
             COUNT(*) FILTER (WHERE estado IN ('moroso','vencido')) * 100.0
               / NULLIF(COUNT(*) FILTER (WHERE estado NOT IN ('pagado','cancelado')), 0),
             1
           ),
           0
         )                                                                   AS "indiceMorosidad"
       FROM pr_prestamos WHERE "empresaId"=$1`,
      [empresaId],
    );
    return {
      totalMorosos:       Number(stats.totalMorosos       ?? 0),
      totalVencidos:      Number(stats.totalVencidos       ?? 0),
      saldoMoraTotal:     Number(stats.saldoMoraTotal      ?? 0),
      carteraVencidaTotal:Number(stats.carteraVencidaTotal ?? 0),
      totalActivos:       Number(stats.totalActivos        ?? 0),
      totalEnMora:        Number(stats.totalEnMora         ?? 0),
      indiceMorosidad:    Number(stats.indiceMorosidad     ?? 0),
    };
  }
}
