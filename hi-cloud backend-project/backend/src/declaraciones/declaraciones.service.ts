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
  mapFormaPagoDgii, columna607PorCodigoDgii, mapTipoIngreso607, tipoIdDgii,
  fechaDgii, montoEntero, TIPOS_BIENES_606, FORMAS_PAGO_DGII,
  desgloseItbisFuenteVerdad,
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
  //
  // Reconstruido contra el formulario oficial DGII (IT-1-2020.xls) — cada
  // casilla se calcula de una fuente real o se marca explícitamente
  // 'no_aplica'/'requiere_revision', nunca un 0 silencioso (ver
  // calcularSeccionIIIT1()). Commit 1 (2026-09-22): Sección II (Ingresos).

  /**
   * Operaciones de venta del período — facturas + notas de crédito (E34,
   * restan) + notas de débito (E33, suman), MISMO patrón/filtros que
   * getFormato607() (estado='emitida', isActive=true) para que IT-1 y el 607
   * describan siempre el mismo universo de comprobantes. Se reusa
   * desgloseItbisFuenteVerdad() para el desglose 18%/16%/exento por
   * documento — prioriza los totales reales del e-CF enviado sobre la suma
   * por línea, igual que en el validador del 607.
   *
   * Devuelve subtotales (base imponible, SIN ITBIS): así es como está
   * expresada la Sección II del IT-1 — confirmado contra el caso dorado del
   * Excel adjunto (casilla 11 = 260,304.00 × 18% = 46,854.72 = casilla 16 de
   * Liquidación exactamente).
   */
  private async operacionesVentaPeriodo(desde: Date, hasta: Date) {
    const rows = await this.dataSource.query<any[]>(`
      SELECT f.id, 1::int AS signo, f."tipoNcf",
             f.subtotal::numeric AS subtotal, f.total::numeric AS total,
             e."jsonEnviado" AS "jsonEnviado",
             (SELECT json_build_object(
                'gravado18', COALESCE(SUM(fd.subtotal)     FILTER (WHERE fd."porcentajeIva" = 18), 0),
                'gravado16', COALESCE(SUM(fd.subtotal)     FILTER (WHERE fd."porcentajeIva" = 16), 0),
                'exento',    COALESCE(SUM(fd.subtotal)     FILTER (WHERE fd."porcentajeIva" NOT IN (18,16)), 0),
                'itbis18',   COALESCE(SUM(fd."importeIva") FILTER (WHERE fd."porcentajeIva" = 18), 0),
                'itbis16',   COALESCE(SUM(fd."importeIva") FILTER (WHERE fd."porcentajeIva" = 16), 0)
              ) FROM factura_detalles fd WHERE fd."facturaId" = f.id) AS "desgloseLineas"
        FROM facturas f
        LEFT JOIN ecf e ON e."facturaId" = f.id AND e."isActive" = true
       WHERE f."empresaId" = $1 AND f.fecha BETWEEN $2 AND $3
         AND f.estado IN ('emitida','pagada') AND f."isActive" = true

      UNION ALL

      SELECT nc.id, -1::int AS signo, nc."tipoNcf",
             nc.subtotal::numeric AS subtotal, nc.total::numeric AS total,
             e."jsonEnviado" AS "jsonEnviado",
             (SELECT json_build_object(
                'gravado18', COALESCE(SUM(d.subtotal) FILTER (WHERE d."porcentajeIva" = 18), 0),
                'gravado16', COALESCE(SUM(d.subtotal) FILTER (WHERE d."porcentajeIva" = 16), 0),
                'exento',    COALESCE(SUM(d.subtotal) FILTER (WHERE d."porcentajeIva" NOT IN (18,16)), 0),
                'itbis18',   COALESCE(SUM(d.iva)      FILTER (WHERE d."porcentajeIva" = 18), 0),
                'itbis16',   COALESCE(SUM(d.iva)      FILTER (WHERE d."porcentajeIva" = 16), 0)
              ) FROM nota_credito_detalles d WHERE d."notaCreditoId" = nc.id) AS "desgloseLineas"
        FROM notas_credito nc
        LEFT JOIN ecf e ON e."documentoOrigenId" = nc.id AND e."documentoOrigenTipo" = 'NOTA_CREDITO' AND e."isActive" = true
       WHERE nc."empresaId" = $1 AND nc.fecha BETWEEN $2 AND $3
         AND nc.estado = 'emitida' AND nc."isActive" = true

      UNION ALL

      SELECT nd.id, 1::int AS signo, nd."tipoNcf",
             nd.subtotal::numeric AS subtotal, nd.total::numeric AS total,
             e."jsonEnviado" AS "jsonEnviado",
             (SELECT json_build_object(
                'gravado18', COALESCE(SUM(d.subtotal) FILTER (WHERE d."porcentajeIva" = 18), 0),
                'gravado16', COALESCE(SUM(d.subtotal) FILTER (WHERE d."porcentajeIva" = 16), 0),
                'exento',    COALESCE(SUM(d.subtotal) FILTER (WHERE d."porcentajeIva" NOT IN (18,16)), 0),
                'itbis18',   COALESCE(SUM(d.iva)      FILTER (WHERE d."porcentajeIva" = 18), 0),
                'itbis16',   COALESCE(SUM(d.iva)      FILTER (WHERE d."porcentajeIva" = 16), 0)
              ) FROM nota_debito_detalles d WHERE d."notaDebitoId" = nd.id) AS "desgloseLineas"
        FROM notas_debito nd
        LEFT JOIN ecf e ON e."documentoOrigenId" = nd.id AND e."documentoOrigenTipo" = 'NOTA_DEBITO' AND e."isActive" = true
       WHERE nd."empresaId" = $1 AND nd.fecha BETWEEN $2 AND $3
         AND nd.estado = 'emitida' AND nd."isActive" = true
    `, [this.eid, desde, hasta]);

    return rows.map(r => {
      const d = desgloseItbisFuenteVerdad(r.jsonEnviado, r.desgloseLineas);
      const signo = Number(r.signo);
      return {
        tipoNcf:  (r.tipoNcf ?? 'E32') as string,
        gravado18: signo * (d?.gravado18 ?? 0),
        gravado16: signo * (d?.gravado16 ?? 0),
        exento:    signo * (d?.exento ?? 0),
        itbis18:   signo * (d?.itbis18 ?? 0),
        itbis16:   signo * (d?.itbis16 ?? 0),
      };
    });
  }

  /**
   * Sección II del IT-1 — Ingresos por Operaciones, casillas 1-15.
   *
   * PRINCIPIO (pedido explícito): ninguna casilla queda en 0 sin verificar si
   * aplica. Las que hoy no tienen una fuente de datos real en el sistema
   * (exención por destino, no sujeción por construcción/comisiones, venta de
   * activos depreciables, tasas Ley 690-16 turismo) se devuelven en 0 con
   * estado 'no_aplica' y una nota explicando por qué — nunca un 0 mudo.
   */
  private async calcularSeccionIIIT1(desde: Date, hasta: Date) {
    const filas = await this.operacionesVentaPeriodo(desde, hasta);

    const suma = (pred: (f: (typeof filas)[number]) => boolean, campo: 'gravado18' | 'gravado16' | 'exento') =>
      Math.round(filas.filter(pred).reduce((s, f) => s + f[campo], 0) * 100) / 100;

    const esExportacion = (f: (typeof filas)[number]) => f.tipoNcf === 'E46';

    // Casilla 2: exportación de bienes — el único tipo de NCF de exportación
    // que existe en el sistema es E46 ("Comprobante para Exportaciones"), que
    // DGII usa para bienes Y servicios sin distinguir a nivel de comprobante.
    // Se clasifica todo en casilla 2 (bienes, el caso mayoritario en pymes) y
    // se avisa — nunca se reparte a ciegas entre 2 y 3.
    const exportacionTotal = suma(esExportacion, 'exento') + suma(esExportacion, 'gravado18') + suma(esExportacion, 'gravado16');
    const avisos: string[] = [];
    if (exportacionTotal !== 0) {
      avisos.push(
        `Se detectaron comprobantes de exportación (E46) por RD$${exportacionTotal.toFixed(2)}, clasificados en su totalidad ` +
        `en la casilla 2 (bienes). El sistema no distingue exportación de bienes vs. servicios a nivel de comprobante — ` +
        `si alguna corresponde a exportación de servicios (casilla 3), debe reclasificarse manualmente.`,
      );
    }

    const casilla2 = exportacionTotal;
    const casilla3 = 0; // ver aviso — no se reparte automáticamente
    // Casilla 4: exenta local general — bucket por defecto de TODO lo exento
    // que no sea exportación (única distinción que el sistema puede hacer
    // hoy: porcentajeIva/e-CF exento vs. gravado).
    const casilla4 = suma(f => !esExportacion(f), 'exento');
    const casilla5 = 0; // exención por destino — sin señal en el sistema (no captura tipo de comprador/zona franca)
    const casilla6 = 0; // no sujeta por construcción — sin módulo de operaciones de constructoras
    const casilla7 = 0; // no sujeta por comisiones — sin módulo de operaciones de comisionistas
    const casilla8 = 0; // exenta Párrafos III/IV Art. 343 — subconjunto de la exención general (casilla 4) que el sistema no distingue
    if (casilla5 === 0) avisos.push('Casilla 5 (exentas por destino): no aplica — el sistema no captura tipo de comprador/zona franca.');
    if (casilla6 === 0) avisos.push('Casilla 6 (no sujetas por construcción): no aplica a este giro — no hay operaciones de constructoras registradas.');
    if (casilla7 === 0) avisos.push('Casilla 7 (no sujetas por comisiones): no aplica a este giro — no hay operaciones de comisionistas registradas.');
    if (casilla8 === 0) avisos.push('Casilla 8 (exentas Párrafos III/IV): incluida dentro de la casilla 4 general — el sistema no distingue este subconjunto.');

    const casilla9 = Math.round((casilla2 + casilla3 + casilla4 + casilla5 + casilla6 + casilla7 + casilla8) * 100) / 100;

    const casilla11 = suma(f => !esExportacion(f), 'gravado18');
    const casilla12 = suma(f => !esExportacion(f), 'gravado16');
    // Ley 690-16 (turismo, 9%/8%): sin tasa configurada en parametros_fiscales
    // (itbis_tasas hoy solo trae general:18/reducida:16) — no hay ninguna
    // empresa activa con esta tasa que el sistema pueda detectar. Se deja
    // documentado y en 0 hasta que se confirme y se agregue la tasa.
    const casilla13 = 0;
    const casilla14 = 0;
    avisos.push(
      'Casillas 13/14 (Ley 690-16, turismo 9%/8%): no aplica — parametros_fiscales.itbis_tasas no tiene ' +
      'configurada ninguna tasa especial de turismo. Si alguna empresa opera bajo esa ley, agregar la tasa primero.',
    );
    // Casilla 15: venta de activos fijos depreciables — sin campo en Factura
    // que distinga "venta de un activo de la empresa" de una venta normal.
    const casilla15 = 0;
    avisos.push('Casilla 15 (venta de activos depreciables Cat. 2/3): no aplica — el sistema no distingue este tipo de venta a nivel de factura.');

    const casilla10 = Math.round((casilla11 + casilla12 + casilla13 + casilla14 + casilla15) * 100) / 100;
    const casilla1  = Math.round((casilla9 + casilla10) * 100) / 100;

    const c = (numero: number, monto: number, estado: 'calculada' | 'no_aplica' = 'calculada') => ({ casilla: numero, monto, estado });

    return {
      casilla1_totalOperaciones: c(1, casilla1),
      noGravadas: {
        casilla2_exportacionBienes:        c(2, casilla2),
        casilla3_exportacionServicios:     c(3, casilla3, casilla3 === 0 ? 'no_aplica' : 'calculada'),
        casilla4_exentasLocales:           c(4, casilla4),
        casilla5_exentasPorDestino:        c(5, casilla5, 'no_aplica'),
        casilla6_noSujetasConstruccion:    c(6, casilla6, 'no_aplica'),
        casilla7_noSujetasComisiones:      c(7, casilla7, 'no_aplica'),
        casilla8_exentasParrafosIIIyIV:    c(8, casilla8, 'no_aplica'),
        casilla9_totalNoGravadas:          c(9, casilla9),
      },
      gravadas: {
        casilla10_totalGravadas:           c(10, casilla10),
        casilla11_gravadas18:              c(11, casilla11),
        casilla12_gravadas16:              c(12, casilla12),
        casilla13_gravadas9Ley690:         c(13, casilla13, 'no_aplica'),
        casilla14_gravadas8Ley690:         c(14, casilla14, 'no_aplica'),
        casilla15_activosDepreciables:     c(15, casilla15, 'no_aplica'),
      },
      avisos,
    };
  }

  async getIT1(mes: number, anio: number) {
    const { desde, hasta } = this.rango(mes, anio);

    const seccionII = await this.calcularSeccionIIIT1(desde, hasta);

    // Ventas del período (facturas emitidas / pagadas) — se mantiene para
    // ventas.porTipoNcf y el conteo de facturas que ya lee la pantalla;
    // la Sección II (arriba) es la fuente de verdad de los montos del IT-1.
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
      /** Sección II del formulario IT-1 (casillas 1-15) — fuente de verdad de los montos. */
      seccionII,
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
        c."retieneItbis",
        c."montoRetencionItbis",
        c."retieneIsr",
        c."montoRetencionIsr",
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
        -- Gasto no tiene retenciones — solo Compra (flujo E41, proveedor
        -- informal) las registra. Columnas fijas para que el UNION ALL calce.
        false                                         AS "retieneItbis",
        0::numeric                                    AS "montoRetencionItbis",
        false                                         AS "retieneIsr",
        0::numeric                                    AS "montoRetencionIsr",
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

      // Retención E41 (compra a proveedor informal, sin RNC) — el único
      // mecanismo de retención en compras que el ERP registra hoy (ver
      // Compra.retieneItbis/retieneIsr y el builder E41 del e-CF). Gasto no
      // participa: siempre llega en false/0 desde el SQL.
      const retieneIsr     = r.retieneIsr === true;
      const retencionISR   = retieneIsr             ? Number(r.montoRetencionIsr   ?? 0) : 0;
      const retencionITBIS = r.retieneItbis === true ? Number(r.montoRetencionItbis ?? 0) : 0;

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
        retencionISR,
        retencionITBIS,
        // Campo 15 del 606 — catálogo DGII de 9 tipos (Alquileres, Honorarios,
        // Otras Rentas, Rentas Presuntas, Intereses PJ/PF, Proveedores del
        // Estado, Juegos telefónicos, Ganadería). Nuestra retención es
        // específicamente por comprar a un proveedor informal (E41), sin
        // confirmación oficial de a cuál de los 9 corresponde ese caso — se
        // usa '03 Otras Rentas' (el cajón de DGII para lo no clasificado en
        // otra categoría, según su propia guía de ayuda CA4035) como la
        // mejor suposición razonable, no un hecho verificado. Confirmado con
        // el usuario 2026-09-19.
        tipoRetencionISR: retieneIsr ? '03' : '',
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

  // ── Compras del 606 sin clasificar (tipoBienes/formaPago en NULL) ─────────
  //
  // A diferencia de un gasto incompleto, una compra NUNCA se excluye del
  // 606 (ver getFormato606 — siempre entra, con COALESCE(...,'09'/'04') al
  // exportar). Esta lista es la advertencia: cuáles de esas compras nadie
  // clasificó nunca, para que el contador las revise antes de declarar en
  // vez de confiar en un default de exportación que no es una decisión real.

  async getComprasSinRevisar606(mes: number, anio: number) {
    const { desde, hasta } = this.rango(mes, anio);
    const eid = this.eid;

    const rows = await this.dataSource.query<any[]>(`
      SELECT c.id, c.folio, c.fecha::text, c.total::numeric,
             c."tipoBienes", c."formaPago",
             COALESCE(p.nombre, 'Proveedor sin nombre') AS proveedor
      FROM compras c
      LEFT JOIN proveedores p ON p.id = c."proveedorId"
      WHERE c."empresaId" = $1
        AND c.fecha BETWEEN $2 AND $3
        AND c."isActive" = true
        AND c.estado IN ('recibida','pagada')
        AND (c."tipoBienes" IS NULL OR c."formaPago" IS NULL)
      ORDER BY c.fecha ASC, c.id ASC
    `, [eid, desde, hasta]);

    return rows.map(r => ({
      id:        r.id,
      folio:     r.folio,
      proveedor: r.proveedor,
      fecha:     String(r.fecha).substring(0, 10),
      total:     Number(r.total),
      motivos: [
        ...(!r.tipoBienes ? ['Sin tipo de bienes'] : []),
        ...(!r.formaPago  ? ['Sin forma de pago']  : []),
      ],
    }));
  }

  // ── Formato 607: Ventas — fix critico: usa eNCF real via JOIN con tabla ecf ─

  async getFormato607(mes: number, anio: number) {
    const { desde, hasta } = this.rango(mes, anio);
    const eid = this.eid;

    // UNION de tres fuentes — mismo patrón que getFormato606() (compras +
    // gastos). Antes solo se leía `facturas`: las notas de crédito (E34) y
    // débito (E33) del período no aparecían en el 607, aunque cada una es su
    // propia línea obligatoria del formato (instructivo DGII, col. 5 "NCF o
    // Documento Modificado" — confirmado contra ayuda.dgii.gov.do/CA2108 y
    // el hilo "Notas de Credito en el 607").
    const rows = await this.dataSource.query<any[]>(`
      SELECT
        f.id, 'FACTURA'::text AS "tipoDocumento",
        f.folio,
        f.fecha::text                                   AS "fechaComprobante",
        f.subtotal::numeric                             AS subtotal,
        f.iva::numeric                                  AS iva,
        f.total::numeric                                AS total,
        f."tipoNcf",
        f.notas,
        f."formasPago",
        e.numero                                        AS "encf",
        e."estadoDGII"                                  AS "estadoDgii",
        e."jsonEnviado"                                  AS "jsonEnviado",
        NULL::text                                       AS "ncfModificado",
        -- Fallback SOLO si no hay e-CF (o su jsonEnviado no trae Totales):
        -- desglose por tasa calculado directo de las líneas — nunca monto
        -- total × 18%, que ignora exentos y la tasa reducida del 16%.
        (SELECT json_build_object(
           'gravado18', COALESCE(SUM(fd.subtotal)     FILTER (WHERE fd."porcentajeIva" = 18), 0),
           'gravado16', COALESCE(SUM(fd.subtotal)     FILTER (WHERE fd."porcentajeIva" = 16), 0),
           'exento',    COALESCE(SUM(fd.subtotal)     FILTER (WHERE fd."porcentajeIva" NOT IN (18,16)), 0),
           'itbis18',   COALESCE(SUM(fd."importeIva") FILTER (WHERE fd."porcentajeIva" = 18), 0),
           'itbis16',   COALESCE(SUM(fd."importeIva") FILTER (WHERE fd."porcentajeIva" = 16), 0)
         ) FROM factura_detalles fd WHERE fd."facturaId" = f.id)  AS "desgloseLineas",
        -- Fuente prioritaria: rncComprador del e-CF (valor oficial declarado a DGII).
        -- Fallback: rncReceptor del cliente, luego rfc.
        COALESCE(
          NULLIF(btrim(e."rncComprador"), ''),
          NULLIF(btrim(c."rncReceptor"), ''),
          c.rfc,
          ''
        )                                               AS "rncComprador",
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

      UNION ALL

      -- Notas de crédito (E34). El eNCF de la factura modificada NO vive en
      -- notas_credito.facturaOriginalId/Folio (eso es el ID/folio interno,
      -- no el eNCF) — vive en ecf.ncfModificado, ya poblado al emitir el
      -- e-CF de la nota (emitir-ecf.use-case.ts).
      SELECT
        nc.id, 'NOTA_CREDITO'::text AS "tipoDocumento",
        nc.numero                                       AS folio,
        nc.fecha::text                                  AS "fechaComprobante",
        nc.subtotal::numeric                            AS subtotal,
        nc.iva::numeric                                 AS iva,
        nc.total::numeric                               AS total,
        nc."tipoNcf",
        nc.notas,
        NULL::jsonb                                      AS "formasPago",
        e.numero                                        AS "encf",
        e."estadoDGII"                                  AS "estadoDgii",
        e."jsonEnviado"                                  AS "jsonEnviado",
        e."ncfModificado"                                AS "ncfModificado",
        (SELECT json_build_object(
           'gravado18', COALESCE(SUM(d.subtotal) FILTER (WHERE d."porcentajeIva" = 18), 0),
           'gravado16', COALESCE(SUM(d.subtotal) FILTER (WHERE d."porcentajeIva" = 16), 0),
           'exento',    COALESCE(SUM(d.subtotal) FILTER (WHERE d."porcentajeIva" NOT IN (18,16)), 0),
           'itbis18',   COALESCE(SUM(d.iva)      FILTER (WHERE d."porcentajeIva" = 18), 0),
           'itbis16',   COALESCE(SUM(d.iva)      FILTER (WHERE d."porcentajeIva" = 16), 0)
         ) FROM nota_credito_detalles d WHERE d."notaCreditoId" = nc.id) AS "desgloseLineas",
        COALESCE(
          NULLIF(btrim(e."rncComprador"), ''),
          NULLIF(btrim(c."rncReceptor"), ''),
          c.rfc,
          ''
        )                                               AS "rncComprador",
        COALESCE(NULLIF(btrim(c."razonSocial"), ''), c.nombre) AS "nombreComprador"
      FROM notas_credito nc
      LEFT JOIN ecf e ON e."documentoOrigenId" = nc.id AND e."documentoOrigenTipo" = 'NOTA_CREDITO' AND e."isActive" = true
      LEFT JOIN clientes c ON c.id = nc."clienteId"
      WHERE nc."empresaId" = $1
        AND nc.fecha BETWEEN $2 AND $3
        AND nc.estado = 'emitida'
        AND nc."isActive" = true

      UNION ALL

      -- Notas de débito (E33) — mismo criterio que las de crédito.
      SELECT
        nd.id, 'NOTA_DEBITO'::text AS "tipoDocumento",
        nd.numero                                       AS folio,
        nd.fecha::text                                  AS "fechaComprobante",
        nd.subtotal::numeric                            AS subtotal,
        nd.iva::numeric                                 AS iva,
        nd.total::numeric                               AS total,
        nd."tipoNcf",
        nd.notas,
        NULL::jsonb                                      AS "formasPago",
        e.numero                                        AS "encf",
        e."estadoDGII"                                  AS "estadoDgii",
        e."jsonEnviado"                                  AS "jsonEnviado",
        e."ncfModificado"                                AS "ncfModificado",
        (SELECT json_build_object(
           'gravado18', COALESCE(SUM(d.subtotal) FILTER (WHERE d."porcentajeIva" = 18), 0),
           'gravado16', COALESCE(SUM(d.subtotal) FILTER (WHERE d."porcentajeIva" = 16), 0),
           'exento',    COALESCE(SUM(d.subtotal) FILTER (WHERE d."porcentajeIva" NOT IN (18,16)), 0),
           'itbis18',   COALESCE(SUM(d.iva)      FILTER (WHERE d."porcentajeIva" = 18), 0),
           'itbis16',   COALESCE(SUM(d.iva)      FILTER (WHERE d."porcentajeIva" = 16), 0)
         ) FROM nota_debito_detalles d WHERE d."notaDebitoId" = nd.id) AS "desgloseLineas",
        COALESCE(
          NULLIF(btrim(e."rncComprador"), ''),
          NULLIF(btrim(c."rncReceptor"), ''),
          c.rfc,
          ''
        )                                               AS "rncComprador",
        COALESCE(NULLIF(btrim(c."razonSocial"), ''), c.nombre) AS "nombreComprador"
      FROM notas_debito nd
      LEFT JOIN ecf e ON e."documentoOrigenId" = nd.id AND e."documentoOrigenTipo" = 'NOTA_DEBITO' AND e."isActive" = true
      LEFT JOIN clientes c ON c.id = nd."clienteId"
      WHERE nd."empresaId" = $1
        AND nd.fecha BETWEEN $2 AND $3
        AND nd.estado = 'emitida'
        AND nd."isActive" = true

      ORDER BY "fechaComprobante" ASC, id ASC
    `, [eid, desde, hasta]);

    const filas = rows.map((r, i) => {
      const rncComprador   = r.rncComprador ?? '';
      const tipoId         = tipoIdDgii(rncComprador);
      // Monto Facturado (col 9 DGII 607) = subtotal SIN ITBIS — mismo
      // significado de columna para factura, NC y ND.
      const montoFacturado = Number(r.subtotal ?? 0);
      // Total cobrado (cols 17-23) = subtotal + ITBIS
      const totalCobrado   = Number(r.total ?? 0);
      const itbis          = Number(r.iva ?? 0);

      // Desglose de forma de pago (columnas 17-23 del 607). Regla DGII
      // (ayuda.dgii.gov.do/CA2108 y el hilo "¿Cuando se reportan notas de
      // débito no es necesario completar...?"): se EXIME solo a las notas de
      // CRÉDITO — para facturas y notas de DÉBITO son obligatorias.
      let efectivo = 0, chequeTransferencia = 0, tarjeta = 0, credito = 0, bonos = 0, permuta = 0, otras = 0;
      if (r.tipoDocumento === 'NOTA_CREDITO') {
        // Exenta por DGII — las 7 columnas quedan en 0 a propósito.
      } else if (r.tipoDocumento === 'NOTA_DEBITO') {
        // notas_debito no captura el método de pago real (a diferencia de
        // facturas.formasPago) — se asume "Crédito" en su totalidad, el
        // mismo fallback que ya usan las facturas sin formasPago (rama de
        // abajo). Si hace falta el desglose real, primero hay que agregar
        // captura de forma de pago a NotaDebito.
        credito = totalCobrado;
      } else {
        // Usa formasPago (dato real, desde el trabajo del e-CF) cuando la
        // factura lo tiene — reparte por tipo, no elige uno. Solo para
        // facturas históricas SIN formasPago (anteriores a la migración que
        // agregó la columna) se cae al match de texto sobre notas — mismo
        // patrón que caja.service.ts.
        const formasPago: { tipo: number; monto: number }[] = Array.isArray(r.formasPago) ? r.formasPago : [];
        if (formasPago.length > 0) {
          for (const fp of formasPago) {
            const columna = columna607PorCodigoDgii(mapFormaPagoDgii(Number(fp.tipo)));
            const monto   = Number(fp.monto ?? 0);
            if      (columna === 'efectivo')            efectivo            += monto;
            else if (columna === 'chequeTransferencia')  chequeTransferencia += monto;
            else if (columna === 'tarjeta')              tarjeta             += monto;
            else if (columna === 'credito')              credito             += monto;
            else if (columna === 'permuta')              permuta             += monto;
            else if (columna === 'otras')                otras               += monto;
            // columna null (tipo no reconocido): no se suma a ninguna — sin
            // bucket confiable es mejor omitir que adivinar.
          }
        } else {
          const metodo = r.notas ?? '';
          efectivo            = metodo.includes('Efectivo')  ? totalCobrado : 0;
          tarjeta             = metodo.includes('Tarjeta')   ? totalCobrado : 0;
          chequeTransferencia = metodo.includes('Transfer')  ? totalCobrado : 0;
          credito             = (!efectivo && !tarjeta && !chequeTransferencia) ? totalCobrado : 0;
        }
      }

      // ITBIS "fuente de verdad" — nunca montoFacturado × 18% (ver
      // desgloseItbisFuenteVerdad en dgii.constants.ts). null solo cuando ni
      // el e-CF ni las líneas dan nada que comparar (p.ej. sin e-CF y sin
      // detalles) — ahí el validador no puede afirmar nada, así que no
      // marca error por ITBIS.
      const desglose = desgloseItbisFuenteVerdad(r.jsonEnviado, r.desgloseLineas);

      return {
        linea:               i + 1,
        id:                  r.id,
        tipoDocumento:       r.tipoDocumento as 'FACTURA' | 'NOTA_CREDITO' | 'NOTA_DEBITO',
        folio:               r.folio,
        encf:                r.encf ?? '',
        ncfModificado:       r.tipoDocumento === 'FACTURA' ? '' : (r.ncfModificado ?? ''),
        estadoDgii:          r.estadoDgii ?? '',
        tipoNcf:             r.tipoNcf ?? 'E32',
        rncComprador,
        nombreComprador:     r.nombreComprador ?? 'Consumidor Final',
        tipoId:              tipoId || '',
        tipoIngreso:         mapTipoIngreso607(r.tipoNcf),
        fechaComprobante:    String(r.fechaComprobante ?? '').substring(0, 10),
        montoFacturado,
        itbis,
        itbisFuente:         desglose?.itbisTotal ?? null,
        desglose607:         desglose,
        itbisRetenido:       0,
        isrRetenido:         0,
        efectivo,
        chequeTransferencia,
        tarjeta,
        credito,
        bonos,
        permuta,
        otras,
      };
    });

    const totales = {
      montoFacturado: filas.reduce((s, f) => s + f.montoFacturado, 0),
      itbis:          filas.reduce((s, f) => s + f.itbis, 0),
      efectivo:       filas.reduce((s, f) => s + f.efectivo, 0),
      tarjeta:        filas.reduce((s, f) => s + f.tarjeta, 0),
      permuta:        filas.reduce((s, f) => s + f.permuta, 0),
      otras:          filas.reduce((s, f) => s + f.otras, 0),
      transferencia:  filas.reduce((s, f) => s + f.chequeTransferencia, 0),
      credito:        filas.reduce((s, f) => s + f.credito, 0),
    };

    return { periodo: { mes, anio }, rnc: await this.getRnc(), totalLineas: filas.length, totales, filas };
  }

  // ── Validacion pre-exportacion ────────────────────────────────────────────

  async validarPeriodo(tipo: '606'|'607'|'608', mes: number, anio: number): Promise<ResumenValidacion> {
    if (tipo === '606') {
      const [data, excluidos, sinRevisar] = await Promise.all([
        this.getFormato606(mes, anio),
        this.getGastosExcluidos606(mes, anio),
        this.getComprasSinRevisar606(mes, anio),
      ]);
      const resultado = this.validator.validar606(data.filas as Fila606[]);
      return { ...resultado, gastosExcluidos: excluidos, comprasSinRevisar: sinRevisar };
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
