import { Injectable } from '@nestjs/common';
import { TenantService } from '../tenant/tenant.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, DataSource } from 'typeorm';
import { Factura } from '../facturas/entities/factura.entity';
import { FacturaDetalle } from '../facturas/entities/factura-detalle.entity';
import { Compra } from '../compras/entities/compra.entity';
import { CompraDetalle } from '../compras/entities/compra-detalle.entity';

@Injectable()
export class DeclaracionesService {
  constructor(
    @InjectRepository(Factura)       private factRepo:  Repository<Factura>,
    @InjectRepository(FacturaDetalle)private fdetRepo:  Repository<FacturaDetalle>,
    @InjectRepository(Compra)        private compRepo:  Repository<Compra>,
    @InjectRepository(CompraDetalle) private cdetRepo:  Repository<CompraDetalle>,
    private dataSource: DataSource,
    private tenantSvc: TenantService,
  ) {}

  private get eid() { return this.tenantSvc.getEmpresaId(); }

  /** Obtiene el RNC de la empresa activa para incluir en XML */
  async getRnc(): Promise<string> {
    const r = await this.dataSource.query(
      'SELECT rnc FROM empresa WHERE id = $1 LIMIT 1',
      [this.eid],
    );
    return r[0]?.rnc ?? '';
  }

  private rango(mes: number, anio: number) {
    const desde = new Date(anio, mes - 1, 1);
    const hasta  = new Date(anio, mes, 0, 23, 59, 59);
    return { desde, hasta };
  }

  // ── IT-1: ITBIS mensual ───────────────────────────────────────────────────

  async getIT1(mes: number, anio: number) {
    const { desde, hasta } = this.rango(mes, anio);

    // Ventas del período (facturas emitidas / pagadas)
    const ventas = await this.factRepo
      .createQueryBuilder('f')
      .leftJoinAndSelect('f.cliente', 'c')
      .where('f.fecha BETWEEN :d AND :h', { d: desde, h: hasta })
      .andWhere('f.estado IN (:...estados)', { estados: ['emitida', 'pagada'] })
      .andWhere('f.empresaId = :eid', { eid: this.eid })
      .andWhere('f.isActive = :active', { active: true })
      .getMany();

    const totalVentas   = ventas.reduce((s, f) => s + Number(f.subtotal), 0);
    const itbisVentas   = ventas.reduce((s, f) => s + Number(f.iva), 0);
    const totalVentasIVA= ventas.reduce((s, f) => s + Number(f.total), 0);

    // Compras del período (crédito fiscal de compras)
    const compras = await this.compRepo
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.proveedor', 'p')
      .where('c.fecha BETWEEN :d AND :h', { d: desde, h: hasta })
      .andWhere('c.estado IN (:...estadosC)', { estadosC: ['recibida', 'pagada'] })
      .andWhere('c.empresaId = :eid', { eid: this.eid })
      .andWhere('c.isActive = :active', { active: true })
      .getMany();

    const totalCompras  = compras.reduce((s, c) => s + Number(c.subtotal ?? 0), 0);
    const itbisCompras  = compras.reduce((s, c) => s + Number(c.itbis ?? 0), 0);
    const itbisNeto     = Math.max(0, itbisVentas - itbisCompras);

    // Resumen por tipo de NCF
    const ventasPorTipo = ventas.reduce((acc, f) => {
      const tipo = (f as any).tipoNcf ?? 'E32';
      if (!acc[tipo]) acc[tipo] = { tipo, cantidad: 0, subtotal: 0, itbis: 0, total: 0 };
      acc[tipo].cantidad++;
      acc[tipo].subtotal += Number(f.subtotal);
      acc[tipo].itbis    += Number(f.iva);
      acc[tipo].total    += Number(f.total);
      return acc;
    }, {} as Record<string, any>);

    return {
      periodo: { mes, anio },
      ventas: {
        cantidad:     ventas.length,
        subtotal:     totalVentas,
        itbis:        itbisVentas,
        total:        totalVentasIVA,
        porTipoNcf:   Object.values(ventasPorTipo),
      },
      compras: {
        cantidad:     compras.length,
        subtotal:     totalCompras,
        itbisCredito: itbisCompras,
      },
      liquidacion: {
        itbisDebito:  itbisVentas,
        itbisCredito: itbisCompras,
        itbisNeto,
        estado:       itbisNeto > 0 ? 'A PAGAR' : 'A FAVOR',
      },
    };
  }

  // ── Formato 606: Compras ──────────────────────────────────────────────────

  async getFormato606(mes: number, anio: number) {
    const { desde, hasta } = this.rango(mes, anio);

    const compras = await this.compRepo
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.proveedor', 'p')
      .where('c.fecha BETWEEN :d AND :h', { d: desde, h: hasta })
      .andWhere('c.isActive = true')
      .orderBy('c.fecha', 'ASC')
      .getMany();

    const filas = compras.map((c, i) => ({
      linea:           i + 1,
      rncProveedor:    (c.proveedor as any)?.rnc ?? '',
      tipoId:          '01', // RNC
      ncf:             (c as any).ncf ?? '',
      fechaComprobante:c.fecha,
      fechaPago:       (c as any).fechaPago ?? c.fecha,
      montoFacturado:  Number(c.subtotal ?? 0) + Number(c.itbis ?? 0),
      itbis:           Number(c.itbis ?? 0),
      retencionISR:    0,
      retencionITBIS:  0,
    }));

    return {
      periodo:      { mes, anio },
      rnc:          await this.getRnc(),
      totalLineas:  filas.length,
      totalMonto:   filas.reduce((s, f) => s + f.montoFacturado, 0),
      totalITBIS:   filas.reduce((s, f) => s + f.itbis, 0),
      filas,
    };
  }

  // ── Formato 607: Ventas ───────────────────────────────────────────────────

  async getFormato607(mes: number, anio: number) {
    const { desde, hasta } = this.rango(mes, anio);

    const facturas = await this.factRepo
      .createQueryBuilder('f')
      .leftJoinAndSelect('f.cliente', 'c')
      .where('f.fecha BETWEEN :d AND :h', { d: desde, h: hasta })
      .andWhere('f.estado IN (:...estados)', { estados: ['emitida', 'pagada'] })
      .andWhere('f.empresaId = :eid', { eid: this.eid })
      .andWhere('f.isActive = :active', { active: true })
      .orderBy('f.fecha', 'ASC')
      .getMany();

    const filas = facturas.map((f, i) => ({
      linea:           i + 1,
      rncComprador:    (f.cliente as any)?.rfc ?? '',
      tipoId:          /^\d{9}$/.test((f.cliente as any)?.rfc ?? '') ? '01' : '02',
      ncf:             (f as any).ecfNumero ?? f.folio,
      tipoNcf:         (f as any).tipoNcf ?? 'E32',
      fechaComprobante:f.fecha,
      montoFacturado:  Number(f.total),
      itbis:           Number(f.iva),
      itbisRetenido:   0,
      isrRetenido:     0,
    }));

    const totales = {
      montoFacturado:  filas.reduce((s, f) => s + f.montoFacturado, 0),
      itbis:           filas.reduce((s, f) => s + f.itbis, 0),
    };

    return { periodo: { mes, anio }, totalLineas: filas.length, totales, filas };
  }

  // ── IR-17 Retenciones del período ─────────────────────────────────────────

  async getIR17(mes: number, anio: number) {
    const { desde, hasta } = this.rango(mes, anio);

    // Facturas con retención (simplificado - usa el porcentaje de ITBIS)
    const facturas = await this.factRepo
      .createQueryBuilder('f')
      .leftJoinAndSelect('f.cliente', 'c')
      .where('f.fecha BETWEEN :d AND :h', { d: desde, h: hasta })
      .andWhere('f.estado IN (:...estados)', { estados: ['emitida', 'pagada'] })
      .andWhere('f.empresaId = :eid', { eid: this.eid })
      .andWhere('f.isActive = :active', { active: true })
      // Filtra E31 o clientes con RNC de 9 dígitos usando alias del JOIN
      .andWhere("(f.tipoNcf = 'E31' OR c.rfc ~ :rfcPattern)", { rfcPattern: '^\\d{9}$' })
      .getMany()
      .catch(() => [] as Factura[]);

    const totalRetenciones = facturas.reduce((s: number, f: Factura) => {
      return s + Number(f.iva) * 0.3;
    }, 0);

    return {
      periodo:          { mes, anio },
      cantidadFacturas: facturas.length,
      totalRetenciones,
      filas: facturas.map((f: Factura, i: number) => ({
        linea:       i + 1,
        rncReceptor: (f.cliente as any)?.rfc ?? '',
        nombre:      (f.cliente as any)?.nombre ?? '',
        folio:       f.folio,
        monto:       Number(f.total),
        retencion:   Number(f.iva) * 0.3,
      })),
    };
  }

  // ── Formato 608: Comprobantes Cancelados ────────────────────────────────────

  async getFormato608(mes: number, anio: number) {
    const periodo  = `${anio}-${String(mes).padStart(2, '0')}`;
    const mesLabel = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                      'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'][mes - 1];

    const facturasCanceladas = await this.dataSource.query<{
      folio: string; tipoNcf: string; fecha: string; fechaCancelacion: string;
      clienteNombre: string; clienteRnc: string; total: string; iva: string;
    }[]>(`
      SELECT
        f.folio,
        COALESCE(f."tipoNcf", 'E32')  AS "tipoNcf",
        f.fecha::text,
        f."updatedAt"::date::text      AS "fechaCancelacion",
        COALESCE(c.nombre, 'Consumidor Final') AS "clienteNombre",
        COALESCE(c."rncReceptor", c.rfc, '')   AS "clienteRnc",
        f.total::text,
        f.iva::text
      FROM facturas f
      LEFT JOIN clientes c ON c.id = f."clienteId"
      WHERE f.estado = 'cancelada'
        AND f."isActive" = true
        AND TO_CHAR(f."updatedAt", 'YYYY-MM') = $1
      ORDER BY f."tipoNcf", f.folio
    `, [periodo]);

    const totalCancelado = facturasCanceladas.reduce((s, r) => s + Number(r.total), 0);
    const porTipo: Record<string, { cantidad: number; monto: number }> = {};
    facturasCanceladas.forEach(f => {
      if (!porTipo[f.tipoNcf]) porTipo[f.tipoNcf] = { cantidad: 0, monto: 0 };
      porTipo[f.tipoNcf].cantidad++;
      porTipo[f.tipoNcf].monto += Number(f.total);
    });

    return {
      periodo: { mes, anio, mesLabel, codigo: periodo },
      comprobantes: facturasCanceladas.map(f => ({
        folio:            f.folio,
        tipoNcf:          f.tipoNcf,
        fechaEmision:     f.fecha,
        fechaCancelacion: f.fechaCancelacion,
        clienteNombre:    f.clienteNombre,
        clienteRnc:       f.clienteRnc,
        total:            Number(f.total),
        iva:              Number(f.iva),
      })),
      resumen: {
        totalDocumentos: facturasCanceladas.length,
        totalMonto:      +totalCancelado.toFixed(2),
        porTipoNcf:      Object.entries(porTipo).map(([tipo, v]) => ({
          tipoNcf: tipo, cantidad: v.cantidad, monto: +v.monto.toFixed(2),
        })),
      },
    };
  }

  // ── Resumen de cumplimiento fiscal del año ────────────────────────────────

  async getResumenAnual(anio: number) {
    const meses = await Promise.all(
      Array.from({ length: 12 }, (_, i) => this.getIT1(i + 1, anio)),
    );

    return {
      anio,
      resumen: meses.map(m => ({
        mes:           m.periodo.mes,
        ventas:        m.ventas.total,
        compras:       m.compras.subtotal,
        itbisDebito:   m.liquidacion.itbisDebito,
        itbisCredito:  m.liquidacion.itbisCredito,
        itbisNeto:     m.liquidacion.itbisNeto,
        estado:        m.liquidacion.estado,
      })),
      totales: {
        ventas:      meses.reduce((s, m) => s + m.ventas.total,      0),
        compras:     meses.reduce((s, m) => s + m.compras.subtotal,   0),
        itbisNeto:   meses.reduce((s, m) => s + m.liquidacion.itbisNeto, 0),
      },
    };
  }
}
