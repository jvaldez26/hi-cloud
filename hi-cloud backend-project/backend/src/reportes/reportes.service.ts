import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ReporteGenerado } from './entities/reporte-generado.entity';
import { FiltroFechaDto } from './dto/filtro-fecha.dto';
import { FiltroMesAnioDto } from './dto/filtro-mes-anio.dto';
import { UserRole } from '../users/enums/user-role.enum';
import { TenantService } from '../tenant/tenant.service';

// ── helpers de fecha ────────────────────────────────────────────────────────

const hoy = () => new Date();
const inicioSemana = () => {
  const d = hoy(); d.setDate(d.getDate() - d.getDay()); d.setHours(0, 0, 0, 0); return d;
};
const inicioMes = () => new Date(hoy().getFullYear(), hoy().getMonth(), 1);
const inicioAnio = () => new Date(hoy().getFullYear(), 0, 1);
const finHoy    = () => { const d = hoy(); d.setHours(23, 59, 59, 999); return d; };

@Injectable()
export class ReportesService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(ReporteGenerado)
    private readonly reporteRepository: Repository<ReporteGenerado>,
    private readonly tenantService: TenantService,
  ) {}

  /** Obtiene el empresaId del contexto CLS actual */
  private get eid(): number { return this.tenantService.getEmpresaId(); }

  // ══════════════════════════════════════════════════════════════════════════
  // HELPERS PRIVADOS
  // ══════════════════════════════════════════════════════════════════════════

  private async sumarFacturas(desde: Date, hasta: Date) {
    const rows = await this.dataSource.query<{ moneda: string; total: string; subtotal: string; iva: string; cantidad: string }[]>(
      `SELECT
         COALESCE(moneda,'DOP')     AS moneda,
         COALESCE(SUM(total), 0)    AS total,
         COALESCE(SUM(subtotal), 0) AS subtotal,
         COALESCE(SUM(iva), 0)      AS iva,
         COUNT(*)                   AS cantidad
       FROM facturas
       WHERE "isActive" = true
         AND "empresaId" = $3
         AND estado IN ('emitida','pagada')
         AND fecha BETWEEN $1 AND $2
       GROUP BY COALESCE(moneda,'DOP')`,
      [desde, hasta, this.eid],
    );
    const dop = rows.find(r => r.moneda === 'DOP');
    const usd = rows.find(r => r.moneda === 'USD');
    // total legacy = suma DOP nativa + DOP equiv de USD (usando tipoCambio guardado)
    const totalDOP = rows.reduce((s, r) => {
      if (r.moneda === 'DOP') return s + Number(r.total);
      // Para monedas ME: no convertimos en el dashboard — reportamos nativos
      return s;
    }, 0);
    return {
      total:    totalDOP,                         // DOP nativos (backward compat)
      subtotal: Number(dop?.subtotal ?? 0),
      iva:      Number(dop?.iva ?? 0),
      cantidad: rows.reduce((s, r) => s + Number(r.cantidad), 0),
      porMoneda: rows.map(r => ({
        moneda:   r.moneda,
        total:    Number(r.total),
        subtotal: Number(r.subtotal),
        iva:      Number(r.iva),
        cantidad: Number(r.cantidad),
      })),
      dopTotal: Number(dop?.total ?? 0),
      usdTotal: Number(usd?.total ?? 0),
    };
  }

  private async sumarCompras(desde: Date, hasta: Date) {
    const rows = await this.dataSource.query<{ moneda: string; total: string; subtotal: string; itbis: string; cantidad: string }[]>(
      `SELECT
         COALESCE(moneda,'DOP')     AS moneda,
         COALESCE(SUM(total), 0)    AS total,
         COALESCE(SUM(subtotal), 0) AS subtotal,
         COALESCE(SUM(itbis), 0)    AS itbis,
         COUNT(*)                   AS cantidad
       FROM compras
       WHERE "isActive" = true
         AND "empresaId" = $3
         AND estado IN ('recibida','pagada')
         AND fecha BETWEEN $1 AND $2
       GROUP BY COALESCE(moneda,'DOP')`,
      [desde, hasta, this.eid],
    );
    const dop = rows.find(r => r.moneda === 'DOP');
    const usd = rows.find(r => r.moneda === 'USD');
    return {
      total:    Number(dop?.total ?? 0),           // DOP nativos (backward compat)
      subtotal: Number(dop?.subtotal ?? 0),
      itbis:    Number(dop?.itbis ?? 0),
      cantidad: rows.reduce((s, r) => s + Number(r.cantidad), 0),
      porMoneda: rows.map(r => ({
        moneda:   r.moneda,
        total:    Number(r.total),
        subtotal: Number(r.subtotal),
        itbis:    Number(r.itbis),
        cantidad: Number(r.cantidad),
      })),
      dopTotal: Number(dop?.total ?? 0),
      usdTotal: Number(usd?.total ?? 0),
    };
  }

  private async countFacturasPendientes(): Promise<number> {
    const r = await this.dataSource.query<{ c: string }[]>(
      `SELECT COUNT(*) AS c FROM facturas WHERE "isActive" = true AND "empresaId" = $1 AND estado = 'emitida'`,
      [this.eid],
    );
    return Number(r[0].c);
  }

  private async countECFsPendientes(): Promise<number> {
    const r = await this.dataSource.query<{ c: string }[]>(
      `SELECT COUNT(*) AS c
       FROM ecf
       WHERE "isActive" = true
         AND "empresaId" = $1
         AND "estadoDGII" IN ('pendiente', 'pendiente_envio', 'enviado')`,
      [this.eid],
    );
    return Number(r[0].c);
  }

  private async countStockBajo(): Promise<number> {
    const r = await this.dataSource.query<{ c: string }[]>(
      `SELECT COUNT(*) AS c FROM productos WHERE "isActive" = true AND "empresaId" = $1 AND stock <= "stockMinimo"`,
      [this.eid],
    );
    return Number(r[0].c);
  }

  private async topClientes(top: number, desde: Date, hasta: Date) {
    return this.dataSource.query<{ clienteId: number; nombre: string; totalVentas: string; cantidadFacturas: string }[]>(
      `SELECT f."clienteId", c.nombre,
              COALESCE(SUM(f.total), 0) AS "totalVentas",
              COUNT(f.id)               AS "cantidadFacturas"
       FROM facturas f
       JOIN clientes c ON c.id = f."clienteId"
       WHERE f."isActive" = true AND f."empresaId" = $4
         AND f.estado IN ('emitida','pagada')
         AND f.fecha BETWEEN $1 AND $2
       GROUP BY f."clienteId", c.nombre
       ORDER BY "totalVentas" DESC
       LIMIT $3`,
      [desde, hasta, top, this.eid],
    );
  }

  private async topProductos(top: number, desde: Date, hasta: Date) {
    return this.dataSource.query<{ productoId: number; nombre: string; totalVendido: string; cantidadUnidades: string }[]>(
      `SELECT fd."productoId", p.nombre,
              COALESCE(SUM(fd.total), 0)    AS "totalVendido",
              COALESCE(SUM(fd.cantidad), 0) AS "cantidadUnidades"
       FROM factura_detalles fd
       JOIN productos p ON p.id = fd."productoId"
       JOIN facturas f  ON f.id = fd."facturaId"
       WHERE f."isActive" = true AND fd."isActive" = true
         AND f."empresaId" = $4
         AND f.estado IN ('emitida','pagada')
         AND f.fecha BETWEEN $1 AND $2
       GROUP BY fd."productoId", p.nombre
       ORDER BY "totalVendido" DESC
       LIMIT $3`,
      [desde, hasta, top, this.eid],
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // DASHBOARD
  // ══════════════════════════════════════════════════════════════════════════

  async getDashboard(userId: number, role: UserRole) {
    const now = hoy();
    const fin = finHoy();
    const mesInicio = inicioMes();
    const anioInicio = inicioAnio();

    const base = async () => {
      const [ventasHoy, ventasSemana, ventasMes, ventasAnio] = await Promise.all([
        this.sumarFacturas(now, fin),
        this.sumarFacturas(inicioSemana(), fin),
        this.sumarFacturas(mesInicio, fin),
        this.sumarFacturas(anioInicio, fin),
      ]);
      const [topCli, topProd, ventasDiarias] = await Promise.all([
        this.topClientes(5, mesInicio, fin),
        this.topProductos(5, mesInicio, fin),
        this.getVentasPorDiaMes({ mes: now.getMonth() + 1, anio: now.getFullYear() }),
      ]);
      return { ventasHoy, ventasSemana, ventasMes, ventasAnio, topClientes: topCli, topProductos: topProd, ventasDiarias };
    };

    if (role === UserRole.VIEWER) {
      const ventasMes = await this.sumarFacturas(mesInicio, fin);
      return { ventasMes, generadoEn: now.toISOString() };
    }

    if (role === UserRole.VENDEDOR) {
      const data = await base();
      return { ...data, generadoEn: now.toISOString() };
    }

    // ADMIN / CONTADOR — dashboard completo
    const [datos, comprasMes, facturasPendientes, ecfPendientes, stockBajo] =
      await Promise.all([
        base(),
        this.sumarCompras(mesInicio, fin),
        this.countFacturasPendientes(),
        this.countECFsPendientes(),
        this.countStockBajo(),
      ]);

    return {
      ...datos,
      comprasMes,
      alertas: { facturasPendientes, ecfPendientes, productosStockBajo: stockBajo },
      generadoEn: now.toISOString(),
    };
  }

  async getKPIs() {
    const fin = finHoy();
    const [
      ventasHoy, ventasSemana, ventasMes, ventasAnio,
      comprasMes, facturasPendientes, ecfPendientes, stockBajo,
      topCli, topProd,
    ] = await Promise.all([
      this.sumarFacturas(hoy(), fin),
      this.sumarFacturas(inicioSemana(), fin),
      this.sumarFacturas(inicioMes(), fin),
      this.sumarFacturas(inicioAnio(), fin),
      this.sumarCompras(inicioMes(), fin),
      this.countFacturasPendientes(),
      this.countECFsPendientes(),
      this.countStockBajo(),
      this.topClientes(5, inicioMes(), fin),
      this.topProductos(5, inicioMes(), fin),
    ]);

    const balanceMes = {
      ingresos: ventasMes.total,
      gastos:   comprasMes.total,
      balance:  ventasMes.total - comprasMes.total,
    };

    return {
      ventas: {
        hoy:    ventasHoy.total,
        semana: ventasSemana.total,
        mes:    ventasMes.total,
        anio:   ventasAnio.total,
      },
      compras: { mes: comprasMes.total },
      alertas: {
        facturasPendientes,
        ecfPendientes,
        productosStockBajo: stockBajo,
      },
      balanceMes,
      topClientes:  topCli.map(c => ({ label: c.nombre,         value: Number(c.totalVentas) })),
      topProductos: topProd.map(p => ({ label: p.nombre,        value: Number(p.totalVendido) })),
      generadoEn: new Date().toISOString(),
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // VENTAS
  // ══════════════════════════════════════════════════════════════════════════

  async getVentasPorPeriodo(dto: FiltroFechaDto) {
    const desde = new Date(dto.fechaDesde);
    const hasta = new Date(dto.fechaHasta);
    const resumen = await this.sumarFacturas(desde, hasta);

    const detalleEstados = await this.dataSource.query<{ estado: string; cantidad: string; total: string }[]>(
      `SELECT estado, COUNT(*) AS cantidad, COALESCE(SUM(total),0) AS total
       FROM facturas
       WHERE "isActive" = true AND "empresaId" = $3 AND fecha BETWEEN $1 AND $2
       GROUP BY estado ORDER BY total DESC`,
      [desde, hasta, this.eid],
    );

    return {
      periodo: { desde: dto.fechaDesde, hasta: dto.fechaHasta },
      resumen,
      porEstado: detalleEstados.map(e => ({
        estado:   e.estado,
        cantidad: Number(e.cantidad),
        total:    Number(e.total),
      })),
    };
  }

  async getVentasPorCliente(dto: FiltroFechaDto) {
    const desde = new Date(dto.fechaDesde);
    const hasta = new Date(dto.fechaHasta);

    const rows = await this.dataSource.query<{
      clienteId: number; nombre: string; rfc: string; rncReceptor: string;
      cantidadFacturas: string; subtotal: string; iva: string; total: string;
    }[]>(
      `SELECT f."clienteId", c.nombre, c.rfc, c."rncReceptor",
              COUNT(f.id)                AS "cantidadFacturas",
              COALESCE(SUM(f.subtotal),0) AS subtotal,
              COALESCE(SUM(f.iva),0)      AS iva,
              COALESCE(SUM(f.total),0)    AS total
       FROM facturas f
       JOIN clientes c ON c.id = f."clienteId"
       WHERE f."isActive" = true AND f."empresaId" = $3
         AND f.estado IN ('emitida','pagada')
         AND f.fecha BETWEEN $1 AND $2
       GROUP BY f."clienteId", c.nombre, c.rfc, c."rncReceptor"
       ORDER BY total DESC`,
      [desde, hasta, this.eid],
    );

    return {
      periodo: { desde: dto.fechaDesde, hasta: dto.fechaHasta },
      total:   rows.reduce((a, r) => a + Number(r.total), 0),
      clientes: rows.map(r => ({
        clienteId:        r.clienteId,
        nombre:           r.nombre,
        rfc:              r.rfc,
        rncReceptor:      r.rncReceptor,
        cantidadFacturas: Number(r.cantidadFacturas),
        subtotal:         Number(r.subtotal),
        iva:              Number(r.iva),
        total:            Number(r.total),
      })),
      grafica: rows.slice(0, 10).map(r => ({ label: r.nombre, value: Number(r.total) })),
    };
  }

  async getVentasPorProducto(dto: FiltroFechaDto) {
    const desde = new Date(dto.fechaDesde);
    const hasta = new Date(dto.fechaHasta);

    const rows = await this.dataSource.query<{
      productoId: number; codigo: string; nombre: string;
      cantidadUnidades: string; subtotal: string; total: string;
    }[]>(
      `SELECT fd."productoId", p.codigo, p.nombre,
              COALESCE(SUM(fd.cantidad),0) AS "cantidadUnidades",
              COALESCE(SUM(fd.subtotal),0) AS subtotal,
              COALESCE(SUM(fd.total),0)    AS total
       FROM factura_detalles fd
       JOIN productos p  ON p.id  = fd."productoId"
       JOIN facturas  f  ON f.id  = fd."facturaId"
       WHERE f."isActive" = true AND fd."isActive" = true
         AND f."empresaId" = $3
         AND f.estado IN ('emitida','pagada')
         AND f.fecha BETWEEN $1 AND $2
       GROUP BY fd."productoId", p.codigo, p.nombre
       ORDER BY total DESC`,
      [desde, hasta, this.eid],
    );

    return {
      periodo: { desde: dto.fechaDesde, hasta: dto.fechaHasta },
      total:   rows.reduce((a, r) => a + Number(r.total), 0),
      productos: rows.map(r => ({
        productoId:       r.productoId,
        codigo:           r.codigo,
        nombre:           r.nombre,
        cantidadUnidades: Number(r.cantidadUnidades),
        subtotal:         Number(r.subtotal),
        total:            Number(r.total),
      })),
      grafica: rows.slice(0, 10).map(r => ({ label: r.nombre, value: Number(r.total) })),
    };
  }

  private async getVentasPorDiaMes(dto: FiltroMesAnioDto) {
    const rows = await this.dataSource.query<{ dia: string; total: string; cantidad: string }[]>(
      `SELECT EXTRACT(DAY FROM fecha)::int AS dia,
              COALESCE(SUM(total),0) AS total,
              COUNT(*) AS cantidad
       FROM facturas
       WHERE "isActive" = true AND "empresaId" = $3
         AND estado IN ('emitida','pagada')
         AND EXTRACT(MONTH FROM fecha) = $1
         AND EXTRACT(YEAR  FROM fecha) = $2
       GROUP BY EXTRACT(DAY FROM fecha)
       ORDER BY dia`,
      [dto.mes, dto.anio, this.eid],
    );
    return rows.map(r => ({ dia: Number(r.dia), total: Number(r.total), cantidad: Number(r.cantidad) }));
  }

  async getVentasPorDia(dto: FiltroMesAnioDto) {
    const data = await this.getVentasPorDiaMes(dto);
    return {
      mes: dto.mes, anio: dto.anio,
      grafica: data.map(r => ({ label: `Día ${r.dia}`, value: r.total })),
      detalle: data,
    };
  }

  async getFacturasPendientes() {
    const rows = await this.dataSource.query<{
      id: number; folio: string; fecha: string;
      clienteNombre: string; total: string; diasTranscurridos: string;
    }[]>(
      `SELECT f.id, f.folio, f.fecha,
              c.nombre AS "clienteNombre",
              f.total,
              (CURRENT_DATE - f.fecha::date) AS "diasTranscurridos"
       FROM facturas f
       JOIN clientes c ON c.id = f."clienteId"
       WHERE f."isActive" = true AND f."empresaId" = $1 AND f.estado = 'emitida'
       ORDER BY f.fecha ASC`,
      [this.eid],
    );

    return {
      total:    rows.reduce((a, r) => a + Number(r.total), 0),
      cantidad: rows.length,
      facturas: rows.map(r => ({
        id:               r.id,
        folio:            r.folio,
        fecha:            r.fecha,
        cliente:          r.clienteNombre,
        total:            Number(r.total),
        diasTranscurridos: Number(r.diasTranscurridos),
      })),
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // COMPRAS
  // ══════════════════════════════════════════════════════════════════════════

  async getComprasPorPeriodo(dto: FiltroFechaDto) {
    const desde = new Date(dto.fechaDesde);
    const hasta = new Date(dto.fechaHasta);
    const resumen = await this.sumarCompras(desde, hasta);

    const detalleEstados = await this.dataSource.query<{ estado: string; cantidad: string; total: string }[]>(
      `SELECT estado, COUNT(*) AS cantidad, COALESCE(SUM(total),0) AS total
       FROM compras
       WHERE "isActive" = true AND "empresaId" = $3 AND fecha BETWEEN $1 AND $2
       GROUP BY estado ORDER BY total DESC`,
      [desde, hasta, this.eid],
    );

    return {
      periodo: { desde: dto.fechaDesde, hasta: dto.fechaHasta },
      resumen,
      porEstado: detalleEstados.map(e => ({
        estado:   e.estado,
        cantidad: Number(e.cantidad),
        total:    Number(e.total),
      })),
    };
  }

  async getComprasPorProveedor(dto: FiltroFechaDto) {
    const desde = new Date(dto.fechaDesde);
    const hasta = new Date(dto.fechaHasta);

    const rows = await this.dataSource.query<{
      proveedorId: number; nombre: string; rnc: string;
      cantidadCompras: string; subtotal: string; itbis: string; total: string;
    }[]>(
      `SELECT c."proveedorId", p.nombre, p.rnc,
              COUNT(c.id)                 AS "cantidadCompras",
              COALESCE(SUM(c.subtotal),0) AS subtotal,
              COALESCE(SUM(c.itbis),0)    AS itbis,
              COALESCE(SUM(c.total),0)    AS total
       FROM compras c
       JOIN proveedores p ON p.id = c."proveedorId"
       WHERE c."isActive" = true AND c."empresaId" = $3
         AND c.estado IN ('recibida','pagada')
         AND c.fecha BETWEEN $1 AND $2
       GROUP BY c."proveedorId", p.nombre, p.rnc
       ORDER BY total DESC`,
      [desde, hasta, this.eid],
    );

    return {
      periodo:    { desde: dto.fechaDesde, hasta: dto.fechaHasta },
      total:      rows.reduce((a, r) => a + Number(r.total), 0),
      proveedores: rows.map(r => ({
        proveedorId:    r.proveedorId,
        nombre:         r.nombre,
        rnc:            r.rnc,
        cantidadCompras: Number(r.cantidadCompras),
        subtotal:       Number(r.subtotal),
        itbis:          Number(r.itbis),
        total:          Number(r.total),
      })),
      grafica: rows.slice(0, 10).map(r => ({ label: r.nombre, value: Number(r.total) })),
    };
  }

  async getComprasPorDia(dto: FiltroMesAnioDto) {
    const rows = await this.dataSource.query<{ dia: string; total: string; cantidad: string }[]>(
      `SELECT EXTRACT(DAY FROM fecha)::int AS dia,
              COALESCE(SUM(total),0) AS total,
              COUNT(*) AS cantidad
       FROM compras
       WHERE "isActive" = true AND "empresaId" = $3
         AND estado IN ('recibida','pagada')
         AND EXTRACT(MONTH FROM fecha) = $1
         AND EXTRACT(YEAR  FROM fecha) = $2
       GROUP BY EXTRACT(DAY FROM fecha)
       ORDER BY dia`,
      [dto.mes, dto.anio, this.eid],
    );

    return {
      mes: dto.mes, anio: dto.anio,
      grafica: rows.map(r => ({ label: `Día ${r.dia}`, value: Number(r.total) })),
      detalle: rows.map(r => ({ dia: Number(r.dia), total: Number(r.total), cantidad: Number(r.cantidad) })),
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // FISCAL / DGII
  // ══════════════════════════════════════════════════════════════════════════

  async getReporte606(dto: FiltroMesAnioDto) {
    const rows = await this.dataSource.query<{
      folio: string; fecha: string; rnc: string; proveedor: string;
      numeroFacturaProv: string; subtotal: string; itbis: string; total: string;
      moneda: string; tipoCambio: string;
    }[]>(
      `SELECT c.folio, c.fecha::text,
              p.rnc, p.nombre AS proveedor,
              COALESCE(c."numeroFacturaProveedor",'') AS "numeroFacturaProv",
              c.subtotal::text, c.itbis::text, c.total::text,
              COALESCE(c.moneda,'DOP') AS moneda,
              COALESCE(c."tipoCambio", 1)::text AS "tipoCambio"
       FROM compras c
       JOIN proveedores p ON p.id = c."proveedorId"
       WHERE c."isActive" = true AND c."empresaId" = $3
         AND c.estado IN ('recibida','pagada')
         AND EXTRACT(MONTH FROM c.fecha) = $1
         AND EXTRACT(YEAR  FROM c.fecha) = $2
       ORDER BY c.fecha, c.folio`,
      [dto.mes, dto.anio, this.eid],
    );

    // Convertir a DOP usando la tasa de emisión (DGII requiere RD$)
    const toRD = (v: string, moneda: string, tasa: string) => {
      const n = Number(v); const t = Number(tasa);
      return moneda === 'DOP' ? n : parseFloat((n * t).toFixed(2));
    };

    const totalItbis = rows.reduce((a, r) => a + toRD(r.itbis, r.moneda, r.tipoCambio), 0);
    const totalMonto = rows.reduce((a, r) => a + toRD(r.total, r.moneda, r.tipoCambio), 0);

    return {
      tipo: '606',
      descripcion: 'Reporte de Compras — DGII Formato 606',
      mes: dto.mes, anio: dto.anio,
      totales: {
        compras:    rows.length,
        itbisPagado: totalItbis,
        montoTotal:  totalMonto,
      },
      detalle: rows.map(r => ({
        folio:             r.folio,
        fecha:             r.fecha,
        rncProveedor:      r.rnc,
        nombreProveedor:   r.proveedor,
        numCFProveedor:    r.numeroFacturaProv,
        moneda:            r.moneda,
        tasaCambio:        Number(r.tipoCambio),
        montoGravado:      toRD(r.subtotal, r.moneda, r.tipoCambio),
        montoGravadoME:    r.moneda !== 'DOP' ? Number(r.subtotal) : undefined,
        itbis:             toRD(r.itbis, r.moneda, r.tipoCambio),
        total:             toRD(r.total, r.moneda, r.tipoCambio),
      })),
    };
  }

  async getReporte607(dto: FiltroMesAnioDto) {
    const rows = await this.dataSource.query<{
      folio: string; fecha: string; ncf: string;
      rncReceptor: string; cliente: string; total: string; updatedAt: string;
    }[]>(
      `SELECT f.folio, f.fecha::text,
              COALESCE(e.numero,'') AS ncf,
              COALESCE(c."rncReceptor",'') AS "rncReceptor",
              c.nombre AS cliente,
              f.total::text,
              f."updatedAt"::text AS "updatedAt"
       FROM facturas f
       JOIN clientes c ON c.id = f."clienteId"
       LEFT JOIN ecf e ON e."facturaId" = f.id
       WHERE f."isActive" = true AND f."empresaId" = $3
         AND f.estado = 'cancelada'
         AND EXTRACT(MONTH FROM f.fecha) = $1
         AND EXTRACT(YEAR  FROM f.fecha) = $2
       ORDER BY f.fecha`,
      [dto.mes, dto.anio, this.eid],
    );

    return {
      tipo: '607',
      descripcion: 'Comprobantes Anulados — DGII Formato 607',
      mes: dto.mes, anio: dto.anio,
      totales: {
        comprobantesAnulados: rows.length,
        montoAnulado:          rows.reduce((a, r) => a + Number(r.total), 0),
      },
      detalle: rows.map(r => ({
        folio:           r.folio,
        fecha:           r.fecha,
        ncf:             r.ncf,
        rncReceptor:     r.rncReceptor,
        nombreReceptor:  r.cliente,
        montoAnulado:    Number(r.total),
        fechaAnulacion:  r.updatedAt,
      })),
    };
  }

  async getReporteITBIS(dto: FiltroMesAnioDto) {
    const [[ventas], [compras]] = await Promise.all([
      this.dataSource.query<{ subtotal: string; itbis: string; total: string; cantidad: string }[]>(
        `SELECT COALESCE(SUM(subtotal),0) AS subtotal,
                COALESCE(SUM(iva),0)      AS itbis,
                COALESCE(SUM(total),0)    AS total,
                COUNT(*)                  AS cantidad
         FROM facturas
         WHERE "isActive" = true AND "empresaId" = $3
           AND estado IN ('emitida','pagada')
           AND EXTRACT(MONTH FROM fecha) = $1 AND EXTRACT(YEAR FROM fecha) = $2`,
        [dto.mes, dto.anio, this.eid],
      ),
      this.dataSource.query<{ subtotal: string; itbis: string; total: string; cantidad: string }[]>(
        `SELECT COALESCE(SUM(subtotal),0) AS subtotal,
                COALESCE(SUM(itbis),0)    AS itbis,
                COALESCE(SUM(total),0)    AS total,
                COUNT(*)                  AS cantidad
         FROM compras
         WHERE "isActive" = true AND "empresaId" = $3
           AND estado IN ('recibida','pagada')
           AND EXTRACT(MONTH FROM fecha) = $1 AND EXTRACT(YEAR FROM fecha) = $2`,
        [dto.mes, dto.anio, this.eid],
      ),
    ]);

    const itbisCobrado = Number(ventas.itbis);
    const itbisPagado  = Number(compras.itbis);
    const balance      = itbisCobrado - itbisPagado;

    return {
      mes: dto.mes, anio: dto.anio,
      ventas: {
        facturas:     Number(ventas.cantidad),
        montoGravado: Number(ventas.subtotal),
        itbisCobrado,
        totalFacturado: Number(ventas.total),
      },
      compras: {
        ordenes:      Number(compras.cantidad),
        montoGravado: Number(compras.subtotal),
        itbisPagado,
        totalComprado: Number(compras.total),
      },
      resumenITBIS: {
        cobrado:      itbisCobrado,
        pagado:       itbisPagado,
        balance:      Number(balance.toFixed(2)),
        situacion:    balance > 0 ? 'A PAGAR A DGII' : balance < 0 ? 'CRÉDITO A FAVOR' : 'EQUILIBRADO',
      },
    };
  }

  async getECFsPorEstado(dto: FiltroMesAnioDto) {
    const rows = await this.dataSource.query<{
      estadoDGII: string; tipo: string; cantidad: string;
    }[]>(
      `SELECT e."estadoDGII", t.codigo AS tipo, COUNT(e.id) AS cantidad
       FROM ecf e
       JOIN tipos_ecf t  ON t.id  = e."tipoECFId"
       JOIN facturas  f  ON f.id  = e."facturaId"
       WHERE e."isActive" = true AND f."empresaId" = $3
         AND EXTRACT(MONTH FROM e."createdAt") = $1
         AND EXTRACT(YEAR  FROM e."createdAt") = $2
       GROUP BY e."estadoDGII", t.codigo
       ORDER BY e."estadoDGII", t.codigo`,
      [dto.mes, dto.anio, this.eid],
    );

    const porEstado: Record<string, number> = {};
    for (const r of rows) {
      porEstado[r.estadoDGII] = (porEstado[r.estadoDGII] ?? 0) + Number(r.cantidad);
    }

    return {
      mes: dto.mes, anio: dto.anio,
      resumenPorEstado: porEstado,
      grafica: Object.entries(porEstado).map(([label, value]) => ({ label, value })),
      detallePorTipo:   rows.map(r => ({ estado: r.estadoDGII, tipo: r.tipo, cantidad: Number(r.cantidad) })),
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // INVENTARIO
  // ══════════════════════════════════════════════════════════════════════════

  async getStockActual() {
    const rows = await this.dataSource.query<{
      id: number; codigo: string; nombre: string; unidadMedida: string;
      stock: string; stockMinimo: string; stockMaximo: string;
      precio: string; categoria: string;
    }[]>(
      `SELECT id, codigo, nombre, "unidadMedida",
              stock::text, "stockMinimo"::text, "stockMaximo"::text,
              precio::text, categoria
       FROM productos
       WHERE "isActive" = true AND "empresaId" = $1
       ORDER BY nombre`,
      [this.eid],
    );

    return {
      totalProductos:   rows.length,
      productos: rows.map(r => ({
        id:           r.id,
        codigo:       r.codigo,
        nombre:       r.nombre,
        unidadMedida: r.unidadMedida,
        stock:        Number(r.stock),
        stockMinimo:  Number(r.stockMinimo),
        stockMaximo:  r.stockMaximo ? Number(r.stockMaximo) : null,
        precio:       Number(r.precio),
        categoria:    r.categoria,
        alerta:       Number(r.stock) <= Number(r.stockMinimo),
      })),
    };
  }

  async getStockBajo() {
    const rows = await this.dataSource.query<{
      id: number; codigo: string; nombre: string;
      stock: string; stockMinimo: string; unidadMedida: string;
    }[]>(
      `SELECT id, codigo, nombre, stock::text, "stockMinimo"::text, "unidadMedida"
       FROM productos
       WHERE "isActive" = true AND stock <= "stockMinimo" AND "empresaId" = $1
       ORDER BY stock ASC`,
      [this.eid],
    );

    return {
      cantidad: rows.length,
      productos: rows.map(r => ({
        id:           r.id,
        codigo:       r.codigo,
        nombre:       r.nombre,
        stock:        Number(r.stock),
        stockMinimo:  Number(r.stockMinimo),
        unidadMedida: r.unidadMedida,
        diferencia:   Number(r.stock) - Number(r.stockMinimo),
      })),
    };
  }

  async getMovimientosPorPeriodo(dto: FiltroFechaDto) {
    const desde = new Date(dto.fechaDesde);
    const hasta = new Date(dto.fechaHasta);

    const [resumen, porTipo] = await Promise.all([
      this.dataSource.query<{ tipo: string; cantidad: string; totalUnidades: string }[]>(
        `SELECT tipo, COUNT(*) AS cantidad,
                COALESCE(SUM(cantidad),0) AS "totalUnidades"
         FROM movimientos_inventario
         WHERE "isActive" = true AND "createdAt" BETWEEN $1 AND $2
           AND "empresaId" = $3
         GROUP BY tipo ORDER BY tipo`,
        [desde, hasta, this.eid],
      ),
      this.dataSource.query<{ dia: string; entradas: string; salidas: string }[]>(
        `SELECT DATE("createdAt") AS dia,
                COALESCE(SUM(CASE WHEN tipo = 'entrada' THEN cantidad ELSE 0 END),0) AS entradas,
                COALESCE(SUM(CASE WHEN tipo = 'salida'  THEN cantidad ELSE 0 END),0) AS salidas
         FROM movimientos_inventario
         WHERE "isActive" = true AND "createdAt" BETWEEN $1 AND $2
           AND "empresaId" = $3
         GROUP BY DATE("createdAt")
         ORDER BY dia`,
        [desde, hasta, this.eid],
      ),
    ]);

    return {
      periodo: { desde: dto.fechaDesde, hasta: dto.fechaHasta },
      resumenPorTipo: resumen.map(r => ({
        tipo:         r.tipo,
        cantidad:     Number(r.cantidad),
        totalUnidades: Number(r.totalUnidades),
      })),
      graficaDiaria: porTipo.map(r => ({
        dia:      r.dia,
        entradas: Number(r.entradas),
        salidas:  Number(r.salidas),
      })),
    };
  }

  async getValorInventario() {
    const rows = await this.dataSource.query<{
      categoria: string; totalProductos: string;
      totalUnidades: string; valorTotal: string;
    }[]>(
      `SELECT COALESCE(categoria,'Sin categoría') AS categoria,
              COUNT(*) AS "totalProductos",
              COALESCE(SUM(stock),0)          AS "totalUnidades",
              COALESCE(SUM(stock * precio),0) AS "valorTotal"
       FROM productos
       WHERE "isActive" = true AND "empresaId" = $1
       GROUP BY categoria
       ORDER BY "valorTotal" DESC`,
      [this.eid],
    );

    const [totales] = await this.dataSource.query<{ productos: string; unidades: string; valor: string }[]>(
      `SELECT COUNT(*) AS productos,
              COALESCE(SUM(stock),0) AS unidades,
              COALESCE(SUM(stock * precio),0) AS valor
       FROM productos WHERE "isActive" = true`,
    );

    return {
      resumen: {
        totalProductos: Number(totales.productos),
        totalUnidades:  Number(totales.unidades),
        valorTotal:     Number(totales.valor).toFixed(2),
      },
      porCategoria: rows.map(r => ({
        categoria:     r.categoria,
        totalProductos: Number(r.totalProductos),
        totalUnidades:  Number(r.totalUnidades),
        valorTotal:     Number(r.valorTotal),
      })),
      grafica: rows.map(r => ({ label: r.categoria, value: Number(r.valorTotal) })),
    };
  }

  // ── Antigüedad por Cobrar (CxC) ───────────────────────────────────────────

  async getAntiguedadCobrar() {
    const eid = this.eid;
    const [row] = await this.dataSource.query<any[]>(`
      SELECT
        COALESCE(SUM(CASE WHEN "fechaVencimiento" >= NOW()
                         THEN "montoPendiente" ELSE 0 END), 0)::numeric AS corriente,
        COALESCE(SUM(CASE WHEN "fechaVencimiento" < NOW()
                          AND "fechaVencimiento" >= NOW() - INTERVAL '30 days'
                         THEN "montoPendiente" ELSE 0 END), 0)::numeric AS dias_0_30,
        COALESCE(SUM(CASE WHEN "fechaVencimiento" < NOW() - INTERVAL '30 days'
                          AND "fechaVencimiento" >= NOW() - INTERVAL '60 days'
                         THEN "montoPendiente" ELSE 0 END), 0)::numeric AS dias_31_60,
        COALESCE(SUM(CASE WHEN "fechaVencimiento" < NOW() - INTERVAL '60 days'
                          AND "fechaVencimiento" >= NOW() - INTERVAL '90 days'
                         THEN "montoPendiente" ELSE 0 END), 0)::numeric AS dias_61_90,
        COALESCE(SUM(CASE WHEN "fechaVencimiento" < NOW() - INTERVAL '90 days'
                         THEN "montoPendiente" ELSE 0 END), 0)::numeric AS dias_90_plus,
        COALESCE(SUM("montoPendiente"), 0)::numeric AS total
      FROM cuentas_por_cobrar
      WHERE "empresaId" = $1
        AND estado NOT IN ('pagada', 'anulada')
        AND "isActive" = true
    `, [eid]);

    return {
      corriente:   Number(row?.corriente   ?? 0),
      dias_0_30:   Number(row?.dias_0_30   ?? 0),
      dias_31_60:  Number(row?.dias_31_60  ?? 0),
      dias_61_90:  Number(row?.dias_61_90  ?? 0),
      dias_90_plus:Number(row?.dias_90_plus ?? 0),
      total:       Number(row?.total        ?? 0),
    };
  }

  // ── Antigüedad por Pagar (CxP) ────────────────────────────────────────────

  async getAntiguedadPagar() {
    const eid = this.eid;
    const [row] = await this.dataSource.query<any[]>(`
      SELECT
        COALESCE(SUM(CASE WHEN "fechaVencimiento" >= NOW()
                         THEN "montoPendiente" ELSE 0 END), 0)::numeric AS corriente,
        COALESCE(SUM(CASE WHEN "fechaVencimiento" < NOW()
                          AND "fechaVencimiento" >= NOW() - INTERVAL '30 days'
                         THEN "montoPendiente" ELSE 0 END), 0)::numeric AS dias_0_30,
        COALESCE(SUM(CASE WHEN "fechaVencimiento" < NOW() - INTERVAL '30 days'
                          AND "fechaVencimiento" >= NOW() - INTERVAL '60 days'
                         THEN "montoPendiente" ELSE 0 END), 0)::numeric AS dias_31_60,
        COALESCE(SUM(CASE WHEN "fechaVencimiento" < NOW() - INTERVAL '60 days'
                          AND "fechaVencimiento" >= NOW() - INTERVAL '90 days'
                         THEN "montoPendiente" ELSE 0 END), 0)::numeric AS dias_61_90,
        COALESCE(SUM(CASE WHEN "fechaVencimiento" < NOW() - INTERVAL '90 days'
                         THEN "montoPendiente" ELSE 0 END), 0)::numeric AS dias_90_plus,
        COALESCE(SUM("montoPendiente"), 0)::numeric AS total
      FROM cuentas_por_pagar
      WHERE "empresaId" = $1
        AND estado NOT IN ('pagada', 'anulada')
        AND "isActive" = true
    `, [eid]);

    return {
      corriente:   Number(row?.corriente   ?? 0),
      dias_0_30:   Number(row?.dias_0_30   ?? 0),
      dias_31_60:  Number(row?.dias_31_60  ?? 0),
      dias_61_90:  Number(row?.dias_61_90  ?? 0),
      dias_90_plus:Number(row?.dias_90_plus ?? 0),
      total:       Number(row?.total        ?? 0),
    };
  }

  // ── Resumen de Gastos del mes (por categoría) ─────────────────────────────

  async getResumenGastos() {
    const eid  = this.eid;
    const ahora = new Date();
    const mesActual  = ahora.getMonth() + 1;
    const anioActual = ahora.getFullYear();

    const rows = await this.dataSource.query<any[]>(`
      SELECT
        COALESCE(categoria::text, 'Sin categoría') AS categoria,
        COALESCE(SUM(total), 0)::numeric            AS monto
      FROM gastos
      WHERE "empresaId" = $1
        AND EXTRACT(MONTH FROM fecha) = $2
        AND EXTRACT(YEAR  FROM fecha) = $3
        AND "isActive" = true
      GROUP BY categoria::text
      ORDER BY monto DESC
    `, [eid, mesActual, anioActual]);

    const gastos = rows.map(r => ({
      categoria: String(r.categoria).replace(/_/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase()),
      monto: Number(r.monto),
    }));

    const total = gastos.reduce((s, g) => s + g.monto, 0);
    const mes   = ahora.toLocaleDateString('es-DO', { month: 'long', year: 'numeric' });

    return { gastos, total, mes };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // GANANCIAS
  // ══════════════════════════════════════════════════════════════════════════

  /** Ganancias de un día específico: Ventas(neto) - Costo productos - Gastos */
  async getGananciasDelDia(fecha?: string) {
    const eid  = this.eid;
    const sid  = this.tenantService.getSucursalId();
    // Fecha a usar — 'YYYY-MM-DD', si no viene usa hoy en RD
    const dia  = fecha
      ? fecha
      : new Date().toLocaleDateString('es-DO', {
          timeZone: 'America/Santo_Domingo',
          year: 'numeric', month: '2-digit', day: '2-digit',
        }).split('/').reverse().join('-');  // DD/MM/YYYY → YYYY-MM-DD

    // ── Ventas + costo del día ───────────────────────────────────────────
    const params: any[] = [eid, dia];
    if (sid) params.push(sid);

    const [ventasRow] = await this.dataSource.query<{
      ventas: string; costo: string; numFacturas: string;
      totalItems: string; itemsSinCosto: string;
    }[]>(`
      SELECT
        COALESCE(SUM(f.subtotal), 0)               AS ventas,
        COALESCE(SUM(fd_agg.costo), 0)             AS costo,
        COUNT(f.id)                                AS "numFacturas",
        COALESCE(SUM(fd_agg."totalItems"), 0)      AS "totalItems",
        COALESCE(SUM(fd_agg."itemsSinCosto"), 0)   AS "itemsSinCosto"
      FROM facturas f
      LEFT JOIN (
        SELECT "facturaId",
               SUM("costoUnitario" * cantidad)                                         AS costo,
               COUNT(id)                                                               AS "totalItems",
               COUNT(id) FILTER (WHERE "costoUnitario" = 0 AND "productoId" IS NOT NULL) AS "itemsSinCosto"
        FROM factura_detalles
        WHERE "isActive" = true
        GROUP BY "facturaId"
      ) fd_agg ON fd_agg."facturaId" = f.id
      WHERE f."isActive" = true
        AND f."empresaId" = $1
        AND f.estado IN ('emitida','pagada')
        AND f.fecha = $2
        ${sid ? 'AND f."sucursalId" = $3' : ''}
    `, params);

    // ── Gastos del día (sin filtro de sucursal — gastos son por empresa) ─
    const [gastosRow] = await this.dataSource.query<{ gastos: string }[]>(`
      SELECT COALESCE(SUM(total), 0) AS gastos
      FROM gastos
      WHERE "isActive" = true
        AND "empresaId" = $1
        AND DATE(fecha AT TIME ZONE 'America/Santo_Domingo') = $2
    `, [eid, dia]);

    const totalVentas   = Number(ventasRow?.ventas    ?? 0);
    const totalCosto    = Number(ventasRow?.costo     ?? 0);
    const totalGastos   = Number(gastosRow?.gastos    ?? 0);
    const numFacturas   = Number(ventasRow?.numFacturas   ?? 0);
    const totalItems    = Number(ventasRow?.totalItems    ?? 0);
    const itemsSinCosto = Number(ventasRow?.itemsSinCosto ?? 0);

    const gananciaBruta = totalVentas - totalCosto;
    const gananciaNeta  = gananciaBruta - totalGastos;

    return {
      fecha: dia,
      totalVentas,
      totalCosto,
      totalGastos,
      gananciaBruta,
      gananciaNeta,
      numFacturas,
      totalItems,
      itemsSinCosto,
      gananciaEsParcial: itemsSinCosto > 0,
      advertencia: itemsSinCosto > 0
        ? `${itemsSinCosto} de ${totalItems} líneas vendidas no tienen costo registrado. La ganancia mostrada es estimada.`
        : null,
    };
  }

  /** Historial de ganancias agrupado por día entre dos fechas */
  async getHistorialGanancias(desde: string, hasta: string) {
    const eid = this.eid;
    const sid = this.tenantService.getSucursalId();

    const ventasParams: any[] = [eid, desde, hasta];
    if (sid) ventasParams.push(sid);

    const ventasPorDia = await this.dataSource.query<{
      dia: string; ventas: string; costo: string; facturas: string;
    }[]>(`
      SELECT
        f.fecha::text                        AS dia,
        COALESCE(SUM(f.subtotal), 0)         AS ventas,
        COALESCE(SUM(fd_agg.costo), 0)       AS costo,
        COUNT(f.id)                          AS facturas
      FROM facturas f
      LEFT JOIN (
        SELECT "facturaId", SUM("costoUnitario" * cantidad) AS costo
        FROM factura_detalles
        WHERE "isActive" = true
        GROUP BY "facturaId"
      ) fd_agg ON fd_agg."facturaId" = f.id
      WHERE f."isActive" = true
        AND f."empresaId" = $1
        AND f.estado IN ('emitida','pagada')
        AND f.fecha BETWEEN $2 AND $3
        ${sid ? 'AND f."sucursalId" = $4' : ''}
      GROUP BY f.fecha
      ORDER BY f.fecha DESC
    `, ventasParams);

    const gastosPorDia = await this.dataSource.query<{ dia: string; gastos: string }[]>(`
      SELECT
        DATE(fecha AT TIME ZONE 'America/Santo_Domingo')::text AS dia,
        COALESCE(SUM(total), 0)                                AS gastos
      FROM gastos
      WHERE "isActive" = true
        AND "empresaId" = $1
        AND DATE(fecha AT TIME ZONE 'America/Santo_Domingo') BETWEEN $2 AND $3
      GROUP BY DATE(fecha AT TIME ZONE 'America/Santo_Domingo')
    `, [eid, desde, hasta]);

    const gastosMap = new Map(gastosPorDia.map(r => [r.dia, Number(r.gastos)]));

    return ventasPorDia.map(r => {
      const ventas   = Number(r.ventas);
      const costo    = Number(r.costo);
      const gastos   = gastosMap.get(r.dia) ?? 0;
      const gananciaBruta = ventas - costo;
      const gananciaNeta  = gananciaBruta - gastos;
      return {
        dia: r.dia,
        ventas,
        costo,
        gastos,
        gananciaBruta,
        gananciaNeta,
        facturas: Number(r.facturas),
      };
    });
  }
}
