import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { TenantService } from '../tenant/tenant.service';
import { fechaHoyRD } from '../common/utils/fecha-local.util';

@Injectable()
export class AnalyticsService {
  constructor(
    private readonly ds:        DataSource,
    private readonly tenantSvc: TenantService,
  ) {}

  private get eid(): number {
    return this.tenantSvc.getEmpresaId();
  }

  // ─── Overview ejecutivo ──────────────────────────────────────────────────────

  async overview(desde?: string, hasta?: string) {
    const empresaId = this.eid;
    const mesActual = new Date();
    const d = desde ?? `${mesActual.getFullYear()}-01-01`;
    const h = hasta  ?? mesActual.toISOString().split('T')[0];

    const [ventas, compras, cxcPend, cxpPend, clientes, cotizaciones] = await Promise.all([
      this.ds.query<{ total: string; cantidad: string }[]>(`
        SELECT COALESCE(SUM(total),0)::text AS total, COUNT(id)::text AS cantidad
        FROM facturas
        WHERE "empresaId" = $3 AND estado IN ('emitida','pagada') AND "isActive" = true
          AND fecha BETWEEN $1 AND $2
      `, [d, h, empresaId]),

      this.ds.query<{ total: string }[]>(`
        SELECT COALESCE(SUM(total),0)::text AS total
        FROM compras
        WHERE "empresaId" = $3 AND estado IN ('recibida','pagada') AND "isActive" = true
          AND fecha BETWEEN $1 AND $2
      `, [d, h, empresaId]),

      this.ds.query<{ total: string; cantidad: string }[]>(`
        SELECT COALESCE(SUM("montoPendiente"),0)::text AS total, COUNT(id)::text AS cantidad
        FROM cuentas_por_cobrar
        WHERE "empresaId" = $1 AND estado IN ('pendiente','pagada_parcial') AND "isActive" = true
      `, [empresaId]),

      this.ds.query<{ total: string }[]>(`
        SELECT COALESCE(SUM("montoPendiente"),0)::text AS total
        FROM cuentas_por_pagar
        WHERE "empresaId" = $1 AND estado IN ('pendiente','pagada_parcial') AND "isActive" = true
      `, [empresaId]),

      this.ds.query<{ total: string }[]>(`
        SELECT COUNT(id)::text AS total FROM clientes
        WHERE "empresaId" = $1 AND "isActive" = true
      `, [empresaId]),

      this.ds.query<{ total: string; convertidas: string }[]>(`
        SELECT COUNT(id)::text AS total,
               COUNT(CASE WHEN estado = 'convertida' THEN 1 END)::text AS convertidas
        FROM cotizaciones
        WHERE "empresaId" = $3 AND "isActive" = true AND fecha BETWEEN $1 AND $2
      `, [d, h, empresaId]),
    ]);

    const totalVentas  = +(ventas[0]?.total ?? 0);
    const totalCompras = +(compras[0]?.total ?? 0);
    const totalCot     = +(cotizaciones[0]?.total ?? 0);
    const cotConv      = +(cotizaciones[0]?.convertidas ?? 0);

    return {
      periodo:  { desde: d, hasta: h },
      ventas:   { total: totalVentas, cantidad: +(ventas[0]?.cantidad ?? 0), margen: totalVentas > 0 ? +((totalVentas - totalCompras) / totalVentas * 100).toFixed(1) : 0 },
      compras:  { total: totalCompras },
      cxc:      { total: +(cxcPend[0]?.total ?? 0), cantidad: +(cxcPend[0]?.cantidad ?? 0) },
      cxp:      { total: +(cxpPend[0]?.total ?? 0) },
      clientes: { total: +(clientes[0]?.total ?? 0) },
      cotizaciones: { total: totalCot, convertidas: cotConv, tasaConversion: totalCot > 0 ? +((cotConv / totalCot) * 100).toFixed(1) : 0 },
    };
  }

  // ─── Ventas por período (12 meses) ───────────────────────────────────────────

  async ventasTendencia(meses = 12) {
    const empresaId = this.eid;
    const mesesSafe = Math.max(1, Math.min(60, Math.trunc(Number(meses)) || 12));
    const rows = await this.ds.query<{ periodo: string; total: string; cantidad: string }[]>(`
      SELECT TO_CHAR(fecha, 'YYYY-MM') AS periodo,
             COALESCE(SUM(total), 0)::text AS total,
             COUNT(id)::text AS cantidad
      FROM facturas
      WHERE "empresaId" = $1 AND estado IN ('emitida','pagada') AND "isActive" = true
        AND fecha >= NOW() - ($2 * INTERVAL '1 month')
      GROUP BY TO_CHAR(fecha, 'YYYY-MM')
      ORDER BY periodo ASC
    `, [empresaId, mesesSafe]);
    return rows.map(r => ({ periodo: r.periodo, total: +r.total, cantidad: +r.cantidad }));
  }

  // ─── Top clientes ─────────────────────────────────────────────────────────────

  async topClientes(limit = 10, desde?: string, hasta?: string) {
    const empresaId = this.eid;
    const d = desde ?? `${new Date().getFullYear()}-01-01`;
    const h = hasta  ?? fechaHoyRD();

    return this.ds.query<any[]>(`
      SELECT f."clienteId", c.nombre,
             COALESCE(SUM(f.total), 0)::text AS total,
             COUNT(f.id)::text AS facturas
      FROM facturas f
      JOIN clientes c ON c.id = f."clienteId"
      WHERE f."empresaId" = $3 AND f.estado IN ('emitida','pagada')
        AND f."isActive" = true AND f.fecha BETWEEN $1 AND $2
      GROUP BY f."clienteId", c.nombre
      ORDER BY SUM(f.total) DESC
      LIMIT $4
    `, [d, h, empresaId, limit]).then(rows => rows.map(r => ({
      clienteId: r.clienteId, nombre: r.nombre, total: +r.total, facturas: +r.facturas,
    })));
  }

  // ─── Top productos ────────────────────────────────────────────────────────────

  async topProductos(limit = 10, desde?: string, hasta?: string) {
    const empresaId = this.eid;
    const d = desde ?? `${new Date().getFullYear()}-01-01`;
    const h = hasta  ?? fechaHoyRD();

    return this.ds.query<any[]>(`
      SELECT fd."productoId", p.nombre,
             COALESCE(SUM(fd.cantidad), 0)::text AS "cantidadVendida",
             COALESCE(SUM(fd.total), 0)::text AS ingresos,
             COUNT(DISTINCT f.id)::text AS "totalVendido"
      FROM factura_detalles fd
      JOIN facturas f  ON f.id = fd."facturaId"
      JOIN productos p ON p.id = fd."productoId"
      WHERE f."empresaId" = $3 AND f.estado IN ('emitida','pagada')
        AND f."isActive" = true AND f.fecha BETWEEN $1 AND $2
      GROUP BY fd."productoId", p.nombre
      ORDER BY SUM(fd.total) DESC
      LIMIT $4
    `, [d, h, empresaId, limit]).then(rows => rows.map(r => ({
      productoId: r.productoId, nombre: r.nombre,
      cantidadVendida: +r.cantidadVendida, ingresos: +r.ingresos, facturas: +r.totalVendido,
    })));
  }

  // ─── CxC Aging ────────────────────────────────────────────────────────────────

  async cxcAging() {
    const empresaId = this.eid;
    const rows = await this.ds.query<{ rango: string; total: string; cantidad: string }[]>(`
      SELECT
        CASE
          WHEN CURRENT_DATE <= "fechaVencimiento"                         THEN '0_Al día'
          WHEN CURRENT_DATE - "fechaVencimiento" BETWEEN 1  AND 30       THEN '1_1-30 días'
          WHEN CURRENT_DATE - "fechaVencimiento" BETWEEN 31 AND 60       THEN '2_31-60 días'
          WHEN CURRENT_DATE - "fechaVencimiento" BETWEEN 61 AND 90       THEN '3_61-90 días'
          ELSE                                                                 '4_+90 días'
        END AS rango,
        COALESCE(SUM("montoPendiente"), 0)::text AS total,
        COUNT(id)::text AS cantidad
      FROM cuentas_por_cobrar
      WHERE "empresaId" = $1 AND estado IN ('pendiente','pagada_parcial') AND "isActive" = true
      GROUP BY 1 ORDER BY 1
    `, [empresaId]);
    return rows.map(r => ({ rango: r.rango.substring(2), total: +r.total, cantidad: +r.cantidad }));
  }

  // ─── Embudo de ventas ─────────────────────────────────────────────────────────

  async embudoVentas() {
    const empresaId = this.eid;
    const [leads, cots, facts] = await Promise.all([
      this.ds.query<{ total: string }[]>(`SELECT COUNT(id)::text AS total FROM crm_leads WHERE "empresaId" = $1 AND "isActive" = true`, [empresaId]),
      this.ds.query<{ total: string; conv: string }[]>(`
        SELECT COUNT(id)::text AS total,
               COUNT(CASE WHEN estado = 'convertida' THEN 1 END)::text AS conv
        FROM cotizaciones WHERE "empresaId" = $1 AND "isActive" = true
      `, [empresaId]),
      this.ds.query<{ total: string }[]>(`
        SELECT COUNT(id)::text AS total FROM facturas
        WHERE "empresaId" = $1 AND "isActive" = true AND estado IN ('emitida','pagada')
      `, [empresaId]),
    ]);

    const nLeads   = +(leads[0]?.total ?? 0);
    const nCots    = +(cots[0]?.total ?? 0);
    const nCotConv = +(cots[0]?.conv ?? 0);
    const nFacts   = +(facts[0]?.total ?? 0);

    return [
      { etapa: 'Leads',        cantidad: nLeads,   pct: 100 },
      { etapa: 'Cotizaciones', cantidad: nCots,    pct: nLeads > 0 ? +((nCots / nLeads) * 100).toFixed(1) : 0 },
      { etapa: 'Convertidas',  cantidad: nCotConv, pct: nCots > 0  ? +((nCotConv / nCots) * 100).toFixed(1) : 0 },
      { etapa: 'Facturas',     cantidad: nFacts,   pct: nCotConv > 0 ? +((nFacts / nCotConv) * 100).toFixed(1) : 0 },
    ];
  }

  // ─── Ventas por vendedor ──────────────────────────────────────────────────────

  async ventasPorVendedor(desde?: string, hasta?: string) {
    const empresaId = this.eid;
    const d = desde ?? `${new Date().getFullYear()}-01-01`;
    const h = hasta  ?? fechaHoyRD();

    return this.ds.query<any[]>(`
      SELECT COALESCE("nombreVendedor", 'Sin vendedor') AS nombre,
             COALESCE(SUM(total), 0)::text AS total,
             COUNT(id)::text AS facturas
      FROM facturas
      WHERE "empresaId" = $3 AND estado IN ('emitida','pagada')
        AND "isActive" = true AND fecha BETWEEN $1 AND $2
      GROUP BY "nombreVendedor"
      ORDER BY SUM(total) DESC
    `, [d, h, empresaId]).then(rows => rows.map(r => ({
      nombre: r.nombre, total: +r.total, facturas: +r.facturas,
    })));
  }

  // ─── Horas pico ──────────────────────────────────────────────────────────────

  async horasPico(meses = 3) {
    const empresaId = this.eid;
    const mesesSafe = Math.max(1, Math.min(60, Math.trunc(Number(meses)) || 3));
    return this.ds.query<{ dia: string; hora: string; cantidad: string }[]>(`
      SELECT TO_CHAR("createdAt", 'D') AS dia,
             TO_CHAR("createdAt", 'HH24') AS hora,
             COUNT(id)::text AS cantidad
      FROM facturas
      WHERE "empresaId" = $1 AND "isActive" = true AND estado IN ('emitida','pagada')
        AND "createdAt" >= NOW() - ($2 * INTERVAL '1 month')
      GROUP BY 1,2 ORDER BY cantidad DESC LIMIT 50
    `, [empresaId, mesesSafe]).then(rows => rows.map(r => ({
      dia:      ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'][Number(r.dia) - 1] ?? r.dia,
      hora:     `${r.hora}:00`,
      cantidad: +r.cantidad,
    })));
  }
}
