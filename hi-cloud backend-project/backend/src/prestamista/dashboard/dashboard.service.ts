import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Injectable()
export class DashboardPrestamistaService {
  private readonly logger = new Logger(DashboardPrestamistaService.name);

  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  async getKpis(empresaId: number) {
    const [kpis] = await this.ds.query<any[]>(
      `SELECT
         COUNT(*) FILTER (WHERE estado NOT IN ('cancelado')) AS totalPrestamos,
         COUNT(*) FILTER (WHERE estado='al_dia') AS prestamosAlDia,
         COUNT(*) FILTER (WHERE estado='moroso') AS prestamosMorosos,
         COUNT(*) FILTER (WHERE estado='vencido') AS prestamosVencidos,
         COUNT(*) FILTER (WHERE estado='pagado') AS prestamosPagados,
         SUM("montoPrincipal") FILTER (WHERE estado NOT IN ('cancelado','pagado')) AS carteraActiva,
         SUM("saldoCapital") FILTER (WHERE estado NOT IN ('cancelado','pagado')) AS saldoCapitalTotal,
         SUM("saldoMora") FILTER (WHERE estado NOT IN ('cancelado')) AS moraTotal,
         SUM("totalPagado") AS recaudadoTotal
       FROM pr_prestamos WHERE "empresaId"=$1`,
      [empresaId],
    );

    const [deudoresKpi] = await this.ds.query<any[]>(
      `SELECT COUNT(*) AS totalDeudores,
              COUNT(*) FILTER (WHERE "prestamosActivos" > 0) AS deudoresActivos,
              COUNT(*) FILTER (WHERE "enListaNegra"=true) AS enListaNegra
       FROM pr_deudores WHERE "empresaId"=$1 AND "isActive"=true`,
      [empresaId],
    );

    const solicitudes = await this.ds.query<any[]>(
      `SELECT estado, COUNT(*) AS cantidad FROM pr_solicitudes
       WHERE "empresaId"=$1 GROUP BY estado`, [empresaId],
    );

    const distribucionMora = await this.ds.query<any[]>(
      `SELECT
         COUNT(*) FILTER (WHERE "diasMoraActual" = 0) AS sinMora,
         COUNT(*) FILTER (WHERE "diasMoraActual" BETWEEN 1 AND 30) AS mora1a30,
         COUNT(*) FILTER (WHERE "diasMoraActual" BETWEEN 31 AND 60) AS mora31a60,
         COUNT(*) FILTER (WHERE "diasMoraActual" BETWEEN 61 AND 90) AS mora61a90,
         COUNT(*) FILTER (WHERE "diasMoraActual" > 90) AS moraMas90
       FROM pr_prestamos WHERE "empresaId"=$1 AND estado NOT IN ('cancelado','pagado')`,
      [empresaId],
    );

    const recaudacionMes = await this.ds.query<any[]>(
      `SELECT DATE_TRUNC('month', fecha) AS mes, SUM("montoPagado") AS total
       FROM pr_pagos WHERE "empresaId"=$1 AND fecha >= NOW() - INTERVAL '12 months'
       GROUP BY 1 ORDER BY 1`, [empresaId],
    );

    const topDeudores = await this.ds.query<any[]>(
      `SELECT d.nombre, d.apellidos, p."saldoTotal", p."diasMoraActual", p.estado, p.numero
       FROM pr_prestamos p JOIN pr_deudores d ON d.id=p."deudorId"
       WHERE p."empresaId"=$1 AND p.estado IN ('moroso','vencido')
       ORDER BY p."saldoTotal" DESC LIMIT 10`, [empresaId],
    );

    return { kpis, deudoresKpi, solicitudes, distribucionMora: distribucionMora[0], recaudacionMes, topDeudores };
  }
}
