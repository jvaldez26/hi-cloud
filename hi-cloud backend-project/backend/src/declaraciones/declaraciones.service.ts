import { Injectable } from '@nestjs/common';
import { TenantService } from '../tenant/tenant.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Factura } from '../facturas/entities/factura.entity';
import { FacturaDetalle } from '../facturas/entities/factura-detalle.entity';
import { Compra } from '../compras/entities/compra.entity';
import { CompraDetalle } from '../compras/entities/compra-detalle.entity';
import { ReporteDgii } from './entities/reporte-dgii.entity';
import { Gasto } from '../gastos/entities/gasto.entity';
import {
  mapFormaPagoDgii, mapTipoIngreso607, tipoIdDgii,
  fechaDgii, montoEntero, TIPOS_BIENES_606, FORMAS_PAGO_DGII,
} from './dgii.constants';
import {
  DgiiValidatorService, Fila606, Fila607, Fila608,
  ResumenValidacion,
} from './dgii-validator.service';
import { createHash } from 'crypto';

@Injectable()
export class DeclaracionesService {
  constructor(
    @InjectRepository(Factura)        private factRepo:     Repository<Factura>,
    @InjectRepository(FacturaDetalle) private fdetRepo:     Repository<FacturaDetalle>,
    @InjectRepository(Compra)         private compRepo:     Repository<Compra>,
    @InjectRepository(CompraDetalle)  private cdetRepo:     Repository<CompraDetalle>,
    @InjectRepository(ReporteDgii)    private reporteRepo:  Repository<ReporteDgii>,
    @InjectRepository(Gasto)          private gastoRepo:    Repository<Gasto>,
    private dataSource:  DataSource,
    private tenantSvc:   TenantService,
    private validator:   DgiiValidatorService,
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

    // Gastos operativos con comprobante fiscal completo (mismo filtro que el Formato 606)
    // Requisito: NCF + RNC + tipoBienes + formaPago — para que IT-1 y 606 sean consistentes
    const [gastosConCfRow] = await this.dataSource.query<
      { cantidad: string; itbis: string }[]
    >(`
      SELECT COUNT(*)::integer AS cantidad, COALESCE(SUM(g.itbis), 0) AS itbis
      FROM gastos g
      WHERE g."empresaId" = $1
        AND g.fecha BETWEEN $2 AND $3
        AND g."isActive" = true
        AND g.categoria != 'gasto_menor'
        AND g.comprobante    IS NOT NULL AND g.comprobante    != ''
        AND g."rncProveedor" IS NOT NULL AND g."rncProveedor" != ''
        AND g."tipoBienes"   IS NOT NULL
        AND g."formaPago"    IS NOT NULL
        AND g.itbis > 0
    `, [this.eid, desde, hasta]);

    const itbisGastosCf  = Number(gastosConCfRow?.itbis    ?? 0);
    const cantGastosCf   = Number(gastosConCfRow?.cantidad  ?? 0);
    const itbisCredito   = itbisCompras + itbisGastosCf;
    const itbisNeto      = Math.max(0, itbisVentas - itbisCredito);

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
      /** Gastos operativos con comprobante fiscal que aportan crédito ITBIS */
      gastosConCf: {
        cantidad:     cantGastosCf,
        itbisCredito: itbisGastosCf,
      },
      liquidacion: {
        itbisDebito:  itbisVentas,
        itbisCredito,          // compras + gastos con CF
        itbisNeto,
        estado:       itbisNeto > 0 ? 'A PAGAR' : 'A FAVOR',
      },
    };
  }

  // ── Formato 606: Compras + Gastos con comprobante fiscal ─────────────────────
  //
  // Fuentes incluidas:
  //   1. compras — facturas de proveedor formales (como antes)
  //   2. gastos  — gastos operativos con comprobante fiscal (NCF + RNC + tipoBienes + formaPago)
  //
  // Un gasto sin alguno de esos 4 campos es excluido en silencio del 606,
  // pero aparece listado al llamar getGastosExcluidos606() (usado en "Validar antes de exportar").

  async getFormato606(mes: number, anio: number) {
    const { desde, hasta } = this.rango(mes, anio);
    const eid = this.eid;

    const rows = await this.dataSource.query<any[]>(`
      -- ── Fuente 1: compras formales ────────────────────────────────────────────
      SELECT
        c.id,
        c.folio,
        c.fecha::text                                AS "fechaComprobante",
        COALESCE(c."fechaPago", c.fecha)::text       AS "fechaPago",
        c.subtotal::numeric                          AS subtotal,
        c.itbis::numeric                             AS itbis,
        c.total::numeric                             AS total,
        c."numeroFacturaProveedor"                   AS "ncfProveedor",
        COALESCE(c."tipoBienes", '09')               AS "tipoBienes",
        COALESCE(c."formaPago",  '04')               AS "formaPago",
        c.notas,
        p.rnc                                        AS "rncProveedor",
        p.nombre                                     AS "nombreProveedor",
        'compra'                                     AS "_source"
      FROM compras c
      LEFT JOIN proveedores p ON p.id = c."proveedorId"
      WHERE c."empresaId" = $1
        AND c.fecha BETWEEN $2 AND $3
        AND c."isActive" = true
        AND c.estado IN ('recibida','pagada')

      UNION ALL

      -- ── Fuente 2: gastos operativos con comprobante fiscal completo ────────────
      -- Requisitos: NCF + RNC del proveedor + tipoBienes + formaPago — todos obligatorios.
      -- Los gastos que no cumplan aparecen en getGastosExcluidos606() para que el usuario
      -- los complete antes de la próxima declaración.
      SELECT
        g.id,
        NULL::text                                   AS folio,
        g.fecha::text                                AS "fechaComprobante",
        g.fecha::text                                AS "fechaPago",
        (g.total - g.itbis)::numeric                 AS subtotal,
        g.itbis::numeric                             AS itbis,
        g.total::numeric                             AS total,
        UPPER(g.comprobante)                         AS "ncfProveedor",
        g."tipoBienes",
        g."formaPago",
        g.descripcion                                AS notas,
        g."rncProveedor",
        g.proveedor                                  AS "nombreProveedor",
        'gasto'                                      AS "_source"
      FROM gastos g
      WHERE g."empresaId" = $1
        AND g.fecha BETWEEN $2 AND $3
        AND g."isActive" = true
        AND g.categoria != 'gasto_menor'
        AND g.comprobante    IS NOT NULL AND g.comprobante    != ''
        AND g."rncProveedor" IS NOT NULL AND g."rncProveedor" != ''
        AND g."tipoBienes"   IS NOT NULL
        AND g."formaPago"    IS NOT NULL

      ORDER BY "fechaComprobante" ASC, id ASC
    `, [eid, desde, hasta]);

    const filas = rows.map((r, i) => {
      const rncProveedor = r.rncProveedor ?? '';
      const tipoId = tipoIdDgii(rncProveedor) || '1';
      const montoFacturado = Number(r.total ?? 0);
      const itbis          = Number(r.itbis ?? 0);

      return {
        linea:            i + 1,
        id:               r.id,
        folio:            r.folio,
        source:           (r._source ?? 'compra') as 'compra' | 'gasto',
        rncProveedor,
        nombreProveedor:  r.nombreProveedor,
        tipoId,
        tipoBienes:       r.tipoBienes,
        tipoBienesLabel:  TIPOS_BIENES_606[r.tipoBienes] ?? '',
        ncfProveedor:     r.ncfProveedor ?? '',
        fechaComprobante: String(r.fechaComprobante ?? '').substring(0, 10),
        fechaPago:        String(r.fechaPago ?? '').substring(0, 10),
        montoFacturado,
        itbis,
        retencionISR:     0,
        retencionITBIS:   0,
        itbisAdelantar:   itbis,
        formaPago:        r.formaPago,
        formaPagoLabel:   FORMAS_PAGO_DGII[r.formaPago] ?? '',
      };
    });

    return {
      periodo:     { mes, anio },
      rnc:         await this.getRnc(),
      totalLineas: filas.length,
      totalMonto:  filas.reduce((s, f) => s + f.montoFacturado, 0),
      totalITBIS:  filas.reduce((s, f) => s + f.itbis, 0),
      filas,
    };
  }

  // ── Gastos excluidos del 606 por datos incompletos ────────────────────────
  //
  // Devuelve los gastos del período que NO entraron al 606 porque les falta
  // al menos uno de los 4 campos requeridos: NCF, RNC, tipoBienes, formaPago.
  // Usado en "Validar antes de exportar" para que el usuario los complete.

  async getGastosExcluidos606(mes: number, anio: number) {
    const { desde, hasta } = this.rango(mes, anio);
    const eid = this.eid;

    const rows = await this.dataSource.query<any[]>(`
      SELECT
        g.id,
        g.descripcion,
        g.categoria,
        g.fecha::text,
        g.total::numeric,
        g.comprobante,
        g."rncProveedor",
        g."tipoBienes",
        g."formaPago"
      FROM gastos g
      WHERE g."empresaId" = $1
        AND g.fecha BETWEEN $2 AND $3
        AND g."isActive" = true
        AND g.categoria != 'gasto_menor'
        AND (
          g.comprobante    IS NULL OR g.comprobante    = '' OR
          g."rncProveedor" IS NULL OR g."rncProveedor" = '' OR
          g."tipoBienes"   IS NULL OR
          g."formaPago"    IS NULL
        )
      ORDER BY g.fecha ASC, g.id ASC
    `, [eid, desde, hasta]);

    return rows.map(r => ({
      id:          r.id,
      descripcion: r.descripcion,
      categoria:   r.categoria,
      fecha:       String(r.fecha).substring(0, 10),
      total:       Number(r.total),
      motivos: [
        ...(!r.comprobante                   ? ['Sin NCF del proveedor']  : []),
        ...(!r.rncProveedor                  ? ['Sin RNC del proveedor']  : []),
        ...(!r.tipoBienes                    ? ['Sin tipo de bienes']      : []),
        ...(!r.formaPago                     ? ['Sin forma de pago']       : []),
      ],
    }));
  }

  // ── Formato 607: Ventas — fix critico: usa eNCF real via JOIN con tabla ecf ─

  async getFormato607(mes: number, anio: number) {
    const { desde, hasta } = this.rango(mes, anio);
    const eid = this.eid;

    const rows = await this.dataSource.query<any[]>(`
      SELECT
        f.id,
        f.folio,
        f.fecha::text                                   AS "fechaComprobante",
        f.subtotal::numeric                             AS subtotal,
        f.iva::numeric                                  AS iva,
        f.total::numeric                                AS total,
        f."tipoNcf",
        f.notas,
        e.numero                                        AS "encf",
        e."estadoDGII"                                  AS "estadoDgii",
        COALESCE(c."rncReceptor", c.rfc, '')            AS "rncComprador",
        -- Misma razón social que se declaró en el e-CF: varios clientes pueden
        -- compartir RNC (p.ej. escuelas de un distrito educativo) y ante DGII
        -- todos van con la razón social registrada de ese contribuyente
        COALESCE(NULLIF(btrim(c."razonSocial"), ''), c.nombre) AS "nombreComprador"
      FROM facturas f
      LEFT JOIN ecf e ON e."facturaId" = f.id AND e."isActive" = true
      LEFT JOIN clientes c ON c.id = f."clienteId"
      WHERE f."empresaId" = $1
        AND f.fecha BETWEEN $2 AND $3
        AND f.estado IN ('emitida','pagada')
        AND f."isActive" = true
      ORDER BY f.fecha ASC, f.id ASC
    `, [eid, desde, hasta]);

    const filas = rows.map((r, i) => {
      const rncComprador   = r.rncComprador ?? '';
      const tipoId         = tipoIdDgii(rncComprador);
      // Monto Facturado (col 9 DGII 607) = subtotal SIN ITBIS
      const montoFacturado = Number(r.subtotal ?? 0);
      // Total cobrado (cols 17-23) = subtotal + ITBIS
      const totalCobrado   = Number(r.total ?? 0);
      const itbis          = Number(r.iva ?? 0);
      const metodo         = r.notas ?? '';
      const efectivo       = metodo.includes('Efectivo')  ? totalCobrado : 0;
      const tarjeta        = metodo.includes('Tarjeta')   ? totalCobrado : 0;
      const transferencia  = metodo.includes('Transfer')  ? totalCobrado : 0;
      const credito        = (!efectivo && !tarjeta && !transferencia) ? totalCobrado : 0;

      return {
        linea:               i + 1,
        id:                  r.id,
        folio:               r.folio,
        encf:                r.encf ?? '',
        estadoDgii:          r.estadoDgii ?? '',
        tipoNcf:             r.tipoNcf ?? 'E32',
        rncComprador,
        nombreComprador:     r.nombreComprador ?? 'Consumidor Final',
        tipoId:              tipoId || '',
        tipoIngreso:         mapTipoIngreso607(r.tipoNcf),
        fechaComprobante:    String(r.fechaComprobante ?? '').substring(0, 10),
        montoFacturado,
        itbis,
        itbisRetenido:       0,
        isrRetenido:         0,
        efectivo,
        chequeTransferencia: transferencia,
        tarjeta,
        credito,
        bonos:               0,
        permuta:             0,
        otras:               0,
      };
    });

    const totales = {
      montoFacturado: filas.reduce((s, f) => s + f.montoFacturado, 0),
      itbis:          filas.reduce((s, f) => s + f.itbis, 0),
      efectivo:       filas.reduce((s, f) => s + f.efectivo, 0),
      tarjeta:        filas.reduce((s, f) => s + f.tarjeta, 0),
      transferencia:  filas.reduce((s, f) => s + f.chequeTransferencia, 0),
      credito:        filas.reduce((s, f) => s + f.credito, 0),
    };

    return { periodo: { mes, anio }, rnc: await this.getRnc(), totalLineas: filas.length, totales, filas };
  }

  // ── Validacion pre-exportacion ────────────────────────────────────────────

  async validarPeriodo(tipo: '606'|'607'|'608', mes: number, anio: number): Promise<ResumenValidacion> {
    if (tipo === '606') {
      const [data, excluidos] = await Promise.all([
        this.getFormato606(mes, anio),
        this.getGastosExcluidos606(mes, anio),
      ]);
      const resultado = this.validator.validar606(data.filas as Fila606[]);
      return { ...resultado, gastosExcluidos: excluidos };
    }
    if (tipo === '607') {
      const data = await this.getFormato607(mes, anio);
      return this.validator.validar607(data.filas as Fila607[]);
    }
    const data = await this.getFormato608(mes, anio);
    const filas608: Fila608[] = ((data as any).comprobantes ?? (data as any).filas ?? [])
      .map((f: any, i: number) => ({
        linea: i + 1, ncf: f.folio ?? f.ncf,
        fechaComprobante: f.fecha, fechaAnulacion: f.fechaCancelacion,
      }));
    return this.validator.validar608(filas608);
  }

  // ── Historial de reportes generados ──────────────────────────────────────

  async getHistorial(limit = 30) {
    return this.reporteRepo.find({
      where: { empresaId: this.eid, isActive: true },
      order: { createdAt: 'DESC' },
      take:  limit,
      select: ['id', 'tipo', 'mes', 'anio', 'totalLineas', 'totalMonto',
               'errores', 'advertencias', 'generadoPor', 'hashContenido', 'createdAt'],
    });
  }

  async getReporteById(id: number) {
    return this.reporteRepo.findOne({ where: { id, empresaId: this.eid } });
  }

  async guardarReporte(params: {
    tipo: '606'|'607'|'608'; mes: number; anio: number;
    totalLineas: number; totalMonto: number;
    errores: number; advertencias: number;
    userId?: number; contenido: string;
  }): Promise<ReporteDgii> {
    const hash = createHash('sha256').update(params.contenido).digest('hex');
    return this.reporteRepo.save(this.reporteRepo.create({
      empresaId: this.eid, tipo: params.tipo, mes: params.mes, anio: params.anio,
      totalLineas: params.totalLineas, totalMonto: params.totalMonto,
      errores: params.errores, advertencias: params.advertencias,
      generadoPor: params.userId, hashContenido: hash, contenido: params.contenido,
    }));
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
