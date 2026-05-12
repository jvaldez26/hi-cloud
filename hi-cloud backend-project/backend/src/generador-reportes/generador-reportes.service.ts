import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { TenantService } from '../tenant/tenant.service';

@Injectable()
export class GeneradorReportesService {
  constructor(
    private readonly ds:       DataSource,
    private readonly tenantSvc: TenantService,
  ) {}

  private get eid() { return this.tenantSvc.getEmpresaId(); }

  // ─── Ventas por período ───────────────────────────────────────────────────────

  async ventasPorPeriodo(desde: string, hasta: string, agrupar: 'dia' | 'semana' | 'mes' = 'mes') {
    const fmt = agrupar === 'dia' ? 'YYYY-MM-DD' : agrupar === 'semana' ? 'IYYY-IW' : 'YYYY-MM';
    return this.ds.query(`
      SELECT
        TO_CHAR(f.fecha, '${fmt}') AS periodo,
        COUNT(f.id)::text            AS cantidad,
        COALESCE(SUM(f.subtotal),0)::text AS subtotal,
        COALESCE(SUM(f.iva),0)::text      AS iva,
        COALESCE(SUM(f.total),0)::text    AS total
      FROM facturas f
      WHERE f."isActive" = true AND f."empresaId" = $3
        AND f.estado IN ('emitida','pagada')
        AND f.fecha BETWEEN $1 AND $2
      GROUP BY 1 ORDER BY 1
    `, [desde, hasta, this.eid]);
  }

  // ─── Top Clientes ─────────────────────────────────────────────────────────────

  async topClientes(desde: string, hasta: string, limite = 20) {
    return this.ds.query(`
      SELECT
        c.id, c.nombre,
        COALESCE(c."rncReceptor", c.rfc, '') AS rnc,
        COUNT(f.id)::text           AS facturas,
        COALESCE(SUM(f.total),0)::text AS total,
        MAX(f.fecha::text)          AS ultimaFactura
      FROM clientes c
      JOIN facturas f ON f."clienteId" = c.id
      WHERE f."isActive" = true AND f."empresaId" = $4
        AND f.estado IN ('emitida','pagada')
        AND f.fecha BETWEEN $1 AND $2
      GROUP BY c.id, c.nombre, c."rncReceptor", c.rfc
      ORDER BY SUM(f.total) DESC
      LIMIT $3
    `, [desde, hasta, limite, this.eid]);
  }

  // ─── Top Productos ────────────────────────────────────────────────────────────

  async topProductos(desde: string, hasta: string, limite = 20) {
    return this.ds.query(`
      SELECT
        p.id, p.codigo, p.nombre, p.categoria,
        COALESCE(SUM(fd.cantidad),0)::text    AS cantidadVendida,
        COALESCE(SUM(fd.total),0)::text       AS ingresos,
        COUNT(DISTINCT f.id)::text            AS enFacturas
      FROM factura_detalles fd
      JOIN facturas f  ON f.id  = fd."facturaId"
      JOIN productos p ON p.id  = fd."productoId"
      WHERE f."isActive" = true AND f."empresaId" = $4
        AND f.estado IN ('emitida','pagada')
        AND f.fecha BETWEEN $1 AND $2
      GROUP BY p.id, p.codigo, p.nombre, p.categoria
      ORDER BY SUM(fd.total) DESC
      LIMIT $3
    `, [desde, hasta, limite, this.eid]);
  }

  // ─── Inventario crítico (stock bajo) ─────────────────────────────────────────

  async inventarioCritico() {
    return this.ds.query(`
      SELECT
        p.id, p.codigo, p.nombre, p.categoria,
        p.stock::text         AS stock,
        p."stockMinimo"::text AS stockMinimo,
        p."costoPromedio"::text AS costoPromedio,
        p."unidadMedida",
        CASE
          WHEN p.stock = 0                   THEN 'sin_stock'
          WHEN p.stock <= p."stockMinimo"    THEN 'critico'
          WHEN p.stock <= p."stockMinimo"*2  THEN 'bajo'
          ELSE 'ok'
        END AS nivel
      FROM productos p
      WHERE p."isActive" = true AND p."empresaId" = $1
        AND p.stock <= p."stockMinimo" * 1.5
      ORDER BY p.stock / NULLIF(p."stockMinimo",0) ASC, p.nombre ASC
    `, [this.eid]);
  }

  // ─── Gastos por categoría ─────────────────────────────────────────────────────

  async gastosPorCategoria(desde: string, hasta: string) {
    return this.ds.query(`
      SELECT
        categoria,
        COUNT(id)::text           AS cantidad,
        COALESCE(SUM(total),0)::text AS total,
        COALESCE(SUM(itbis),0)::text AS itbis
      FROM gastos
      WHERE "isActive" = true AND "empresaId" = $3
        AND fecha BETWEEN $1 AND $2
      GROUP BY categoria ORDER BY SUM(total) DESC
    `, [desde, hasta, this.eid]);
  }

  // ─── Balance de nómina ────────────────────────────────────────────────────────

  async balanceNomina(mes: number, anio: number) {
    const periodo = `${anio}-${String(mes).padStart(2, '0')}`;
    return this.ds.query(`
      SELECT
        e.cargo, e.departamento,
        COUNT(*)::text                        AS empleados,
        COALESCE(SUM(e."salarioBase"),0)::text AS totalSalarios,
        COALESCE(SUM(e."salarioBase" * 0.0287),0)::text AS totalAfp,
        COALESCE(SUM(e."salarioBase" * 0.0304),0)::text AS totalSfs
      FROM empleados e
      WHERE e."isActive" = true AND e.estado = 'activo'
      GROUP BY e.cargo, e.departamento
      ORDER BY SUM(e."salarioBase") DESC
    `);
  }

  // ─── CxC por antigüedad ───────────────────────────────────────────────────────

  async cxcAging() {
    return this.ds.query(`
      SELECT
        c.nombre AS cliente,
        f.folio  AS factura,
        cxc."montoPendiente"::text,
        cxc."fechaVencimiento"::text,
        (CURRENT_DATE - cxc."fechaVencimiento")::text AS diasVencida,
        CASE
          WHEN CURRENT_DATE <= cxc."fechaVencimiento"          THEN 'al_dia'
          WHEN CURRENT_DATE - cxc."fechaVencimiento" <= 30     THEN '1_30_dias'
          WHEN CURRENT_DATE - cxc."fechaVencimiento" <= 60     THEN '31_60_dias'
          WHEN CURRENT_DATE - cxc."fechaVencimiento" <= 90     THEN '61_90_dias'
          ELSE 'mas_90_dias'
        END AS rango
      FROM cuentas_por_cobrar cxc
      JOIN clientes  c ON c.id = cxc."clienteId"
      JOIN facturas  f ON f.id = cxc."facturaId"
      WHERE cxc."isActive" = true AND cxc."empresaId" = $1
        AND cxc.estado IN ('pendiente','pagada_parcial')
      ORDER BY cxc."fechaVencimiento" ASC
    `, [this.eid]);
  }

  // ─── Comparativo mensual (año actual vs año anterior) ─────────────────────────

  async comparativoMensual(anio: number) {
    return this.ds.query(`
      SELECT
        TO_CHAR(f.fecha, 'MM') AS mes,
        EXTRACT(YEAR FROM f.fecha)::text AS anio,
        COALESCE(SUM(f.total),0)::text AS total,
        COUNT(f.id)::text AS facturas
      FROM facturas f
      WHERE f."isActive" = true AND f."empresaId" = $3
        AND f.estado IN ('emitida','pagada')
        AND EXTRACT(YEAR FROM f.fecha) IN ($1, $2)
      GROUP BY 1, 2 ORDER BY anio, mes
    `, [anio, anio - 1, this.eid]);
  }

  // ─── Proveedores — compras del período ────────────────────────────────────────

  async comprasPorProveedor(desde: string, hasta: string) {
    return this.ds.query(`
      SELECT
        p.nombre AS proveedor,
        COALESCE(p.rnc,'') AS rnc,
        COUNT(c.id)::text   AS ordenes,
        COALESCE(SUM(c.total),0)::text AS total
      FROM compras c
      JOIN proveedores p ON p.id = c."proveedorId"
      WHERE c."isActive" = true AND c."empresaId" = $3
        AND c.estado IN ('recibida','pagada')
        AND c.fecha BETWEEN $1 AND $2
      GROUP BY p.nombre, p.rnc
      ORDER BY SUM(c.total) DESC
    `, [desde, hasta, this.eid]);
  }
}
