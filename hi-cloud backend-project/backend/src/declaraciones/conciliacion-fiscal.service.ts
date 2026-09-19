import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { TenantService } from '../tenant/tenant.service';
import { TIPOS_BIENES_606, CORRESPONDENCIA_606_IR2 } from './dgii.constants';
import { CATEGORIA_LABELS } from '../gastos/entities/gasto.entity';

/**
 * FASE 3 del catálogo fiscal dominicano — conciliación 606 vs IR-2.
 *
 * HERRAMIENTA DE CONTROL INTERNO, no un simulador de validaciones de DGII:
 * la investigación previa a este módulo (2026-09) no encontró evidencia de
 * que DGII cruce automáticamente el IR-2 contra los 606 enviados. Por eso
 * nada de lo que devuelve este servicio (ni el texto que lo consuma en el
 * frontend) puede decir "DGII va a rechazar" o "esto es un error" — solo
 * qué dos números no coinciden y de qué se compone la diferencia. El
 * contador decide si la diferencia es legítima.
 *
 * Dos caminos que nunca se han cruzado antes de este módulo:
 *   - El 606 sale de `compras` y `gastos` (ver DeclaracionesService.getFormato606).
 *   - El IR-2 (vía las etiquetas de Fase 1/2) sale de `asiento_lineas`.
 * Son fuentes independientes — se espera que no cuadren exactamente, y un
 * descuadre no es, por sí mismo, evidencia de un bug de este reporte.
 *
 * "606 efectivamente clasificado" aquí es SIEMPRE un cálculo en vivo sobre
 * la clasificación actual de compras/gastos del ejercicio — no el snapshot
 * de ningún TXT ya descargado. `ReporteDgii` sí guarda un snapshot inmutable
 * por mes, pero solo el total agregado del archivo, no un desglose por
 * código de bien/servicio — no hay forma de reconstruir "lo que se envió"
 * por código a partir de ese snapshot. `mesesSinTxtGenerado` es lo más
 * cerca que este servicio llega a "qué no se ha enviado": los meses del año
 * para los que nunca se generó y descargó un TXT 606.
 */
@Injectable()
export class ConciliacionFiscalService {
  constructor(
    private dataSource: DataSource,
    private tenantSvc: TenantService,
  ) {}

  private get eid(): number {
    return this.tenantSvc.getEmpresaId();
  }

  async getConciliacion606IR2(anio: number) {
    const eid = this.eid;
    const desde = `${anio}-01-01`;
    const hasta = `${anio}-12-31`;

    const [porTipo606, porTipoIR2, mesesConTxt, comprasSinRevisar, gastosSinComprobante, cuentasSinEtiqueta, porComprobante] =
      await Promise.all([
        this.total606PorTipo(eid, desde, hasta),
        this.totalIR2PorTipo(eid, desde, hasta),
        this.mesesConTxt606(eid, anio),
        this.comprasSinRevisar(eid, desde, hasta),
        this.gastosSinComprobante(eid, desde, hasta),
        this.cuentasSinEtiquetaConSaldo(eid, desde, hasta),
        this.anexoJPorTipoComprobante(eid, desde, hasta),
      ]);

    const mapa606: Record<string, { total: number; cantidad: number }> = {};
    for (const r of porTipo606) mapa606[r.codigo] = { total: Number(r.total), cantidad: Number(r.cantidad) };

    const mapaIR2ConNCF: Record<string, number> = {};
    const mapaIR2SinNCF: Record<string, number> = {};
    for (const r of porTipoIR2) {
      if (!r.codigo) continue;
      if (r.requiereNCF === false) mapaIR2SinNCF[r.codigo] = (mapaIR2SinNCF[r.codigo] ?? 0) + Number(r.total);
      else mapaIR2ConNCF[r.codigo] = (mapaIR2ConNCF[r.codigo] ?? 0) + Number(r.total);
    }

    // Object.keys(TIPOS_BIENES_606) NO sirve aquí: '10' y '11' son índices de
    // array válidos para JS y se reordenan antes que '01'..'09' (que sí tienen
    // cero a la izquierda) — se recorre CORRESPONDENCIA_606_IR2 en su lugar,
    // que ya está en el orden oficial 01→11.
    const filasPorTipo = CORRESPONDENCIA_606_IR2.map(({ codigo606 }) => {
      const correspondencia = CORRESPONDENCIA_606_IR2.find((c) => c.codigo606 === codigo606) ?? null;
      const total606 = mapa606[codigo606]?.total ?? 0;
      const cantidad606 = mapa606[codigo606]?.cantidad ?? 0;
      const totalIR2ConNCF = mapaIR2ConNCF[codigo606] ?? 0;
      const totalIR2SinNCF = mapaIR2SinNCF[codigo606] ?? 0;
      return {
        codigo606,
        labelTipoBienes: TIPOS_BIENES_606[codigo606],
        correspondencia,
        // ── Procedencia de cada número, para rotular en la pantalla ──
        total606: {
          valor: total606,
          cantidad: cantidad606,
          procedencia: 'Recálculo en vivo de compras y gastos del ejercicio clasificados con este código (mismo criterio que el Formato 606).',
        },
        totalIR2ConNCF: {
          valor: totalIR2ConNCF,
          procedencia: 'Suma de asientos contabilizados en cuentas etiquetadas con este código 606, requiereNCF=true (o sin dictamen).',
        },
        totalIR2SinNCF: {
          valor: totalIR2SinNCF,
          procedencia: 'Suma de asientos contabilizados en cuentas etiquetadas con este código 606, requiereNCF=false — nunca puede aparecer en el 606 por diseño.',
        },
        diferencia: +(totalIR2ConNCF - total606).toFixed(2),
      };
    });

    return {
      anio,
      filasPorTipo,
      totales: {
        total606: +filasPorTipo.reduce((s, f) => s + f.total606.valor, 0).toFixed(2),
        totalIR2ConNCF: +filasPorTipo.reduce((s, f) => s + f.totalIR2ConNCF.valor, 0).toFixed(2),
        totalIR2SinNCF: +filasPorTipo.reduce((s, f) => s + f.totalIR2SinNCF.valor, 0).toFixed(2),
        diferencia: +filasPorTipo.reduce((s, f) => s + f.diferencia, 0).toFixed(2),
      },
      correspondencias: CORRESPONDENCIA_606_IR2,
      alertas: {
        mesesSinTxtGenerado: mesesConTxt.mesesSinTxt,
        comprasSinRevisar,
        gastosSinComprobante,
        cuentasSinEtiquetaConSaldo: cuentasSinEtiqueta,
      },
      anexoJ: porComprobante,
    };
  }

  // ── (a) 606 efectivamente clasificado, agrupado por código ────────────────
  private async total606PorTipo(eid: number, desde: string, hasta: string) {
    return this.dataSource.query<{ codigo: string; total: string; cantidad: string }[]>(
      `
      SELECT "tipoBienes" AS codigo, COALESCE(SUM(monto), 0)::numeric AS total, COUNT(*)::int AS cantidad
      FROM (
        SELECT COALESCE(c."tipoBienes", '09') AS "tipoBienes", c.total::numeric AS monto
        FROM compras c
        WHERE c."empresaId" = $1 AND c.fecha BETWEEN $2 AND $3
          AND c."isActive" = true AND c.estado IN ('recibida', 'pagada')
        UNION ALL
        SELECT g."tipoBienes", g.total::numeric AS monto
        FROM gastos g
        WHERE g."empresaId" = $1 AND g.fecha BETWEEN $2 AND $3
          AND g."isActive" = true AND g.categoria != 'gasto_menor'
          AND g.comprobante IS NOT NULL AND g.comprobante != ''
          AND g."rncProveedor" IS NOT NULL AND g."rncProveedor" != ''
          AND g."tipoBienes" IS NOT NULL AND g."formaPago" IS NOT NULL
      ) x
      GROUP BY "tipoBienes"
      `,
      [eid, desde, hasta],
    );
  }

  // ── (b) IR-2 según los asientos, agrupado por tipoGasto606 de la cuenta ───
  private async totalIR2PorTipo(eid: number, desde: string, hasta: string) {
    return this.dataSource.query<{ codigo: string; requiereNCF: boolean | null; total: string }[]>(
      `
      SELECT cc."tipoGasto606" AS codigo, cc."requiereNCF" AS "requiereNCF",
             COALESCE(SUM(al.debe - al.haber), 0)::numeric AS total
      FROM cuentas_contables cc
      JOIN asiento_lineas al ON al."cuentaContableId" = cc.id AND al."isActive" = true
      JOIN asientos_contables ac ON ac.id = al."asientoId"
        AND ac.estado = 'contabilizado' AND ac."isActive" = true
        AND ac.fecha BETWEEN $2 AND $3 AND ac."empresaId" = $1
      WHERE cc."isActive" = true AND cc."empresaId" = $1 AND cc."tipoGasto606" IS NOT NULL
      GROUP BY cc."tipoGasto606", cc."requiereNCF"
      `,
      [eid, desde, hasta],
    );
  }

  // ── Meses del año sin ningún TXT 606 generado (el único rastro inmutable de "enviado") ──
  private async mesesConTxt606(eid: number, anio: number) {
    const rows = await this.dataSource.query<{ mes: number }[]>(
      `SELECT DISTINCT mes FROM reportes_dgii WHERE "empresaId" = $1 AND tipo = '606' AND anio = $2 AND "isActive" = true`,
      [eid, anio],
    );
    const conTxt = new Set(rows.map((r) => Number(r.mes)));
    const mesesSinTxt = Array.from({ length: 12 }, (_, i) => i + 1).filter((m) => !conTxt.has(m));
    return { mesesSinTxt };
  }

  // ── Alerta: compras que conservan la clasificación 606 por defecto, sin revisar ──
  private async comprasSinRevisar(eid: number, desde: string, hasta: string) {
    const rows = await this.dataSource.query<any[]>(
      `
      SELECT c.id, c.folio, c.fecha::text, c.total::numeric,
             COALESCE(p.nombre, 'Proveedor sin nombre') AS proveedor
      FROM compras c
      LEFT JOIN proveedores p ON p.id = c."proveedorId"
      WHERE c."empresaId" = $1 AND c.fecha BETWEEN $2 AND $3
        AND c."isActive" = true AND c.estado IN ('recibida', 'pagada')
        AND (c."tipoBienes" IS NULL OR c."formaPago" IS NULL)
      ORDER BY c.fecha ASC, c.id ASC
      `,
      [eid, desde, hasta],
    );
    return rows.map((r) => ({
      id: r.id, folio: r.folio, proveedor: r.proveedor,
      fecha: String(r.fecha).substring(0, 10), total: Number(r.total),
    }));
  }

  // ── Alerta: gastos contabilizados sin comprobante que deberían tenerlo según requiereNCF ──
  private async gastosSinComprobante(eid: number, desde: string, hasta: string) {
    const rows = await this.dataSource.query<any[]>(
      `
      SELECT g.id, g.descripcion, g.categoria, g.fecha::text, g.total::numeric
      FROM gastos g
      WHERE g."empresaId" = $1 AND g.fecha BETWEEN $2 AND $3
        AND g."isActive" = true AND g.categoria != 'gasto_menor'
        AND (g.comprobante IS NULL OR g.comprobante = '')
      ORDER BY g.fecha ASC, g.id ASC
      `,
      [eid, desde, hasta],
    );
    if (rows.length === 0) return [];

    // Categoria → código de cuenta (CATEGORIA_LABELS, ya usado por GastosPage) → requiereNCF de esa cuenta.
    const codigos = [...new Set(rows.map((r) => (CATEGORIA_LABELS as any)[r.categoria]?.cuenta).filter(Boolean))];
    if (codigos.length === 0) return [];
    const cuentas: { codigo: string; requiereNCF: boolean | null }[] = await this.dataSource.query(
      `SELECT codigo, "requiereNCF" FROM cuentas_contables WHERE "empresaId" = $1 AND codigo = ANY($2::text[])`,
      [eid, codigos],
    );
    const requiereNCFPorCodigo = new Map(cuentas.map((c) => [c.codigo, c.requiereNCF]));

    return rows
      .filter((r) => {
        const codigoCuenta = (CATEGORIA_LABELS as any)[r.categoria]?.cuenta;
        return codigoCuenta && requiereNCFPorCodigo.get(codigoCuenta) === true;
      })
      .map((r) => ({
        id: r.id, descripcion: r.descripcion, categoria: r.categoria,
        fecha: String(r.fecha).substring(0, 10), total: Number(r.total),
      }));
  }

  // ── Alerta: cuentas de movimiento con saldo en el ejercicio y sin ninguna etiqueta fiscal ──
  //
  // FASE 4 Bloque A: anexoIR2 dejó de ser una columna de cuentas_contables
  // (una cuenta puede aportar a varios anexos a la vez — ver
  // cuenta-anexo-ir2.entity.ts). "sin ninguna etiqueta" ahora es "sin
  // tipoGasto606 Y sin ninguna fila activa en cuenta_anexo_ir2", vía
  // NOT EXISTS en vez de `cc."anexoIR2" IS NULL`.
  private async cuentasSinEtiquetaConSaldo(eid: number, desde: string, hasta: string) {
    const rows = await this.dataSource.query<any[]>(
      `
      SELECT cc.codigo, cc.nombre, cc.tipo,
             COALESCE(SUM(CASE WHEN cc.naturaleza = 'deudora' THEN al.debe - al.haber ELSE al.haber - al.debe END), 0)::numeric AS saldo
      FROM cuentas_contables cc
      JOIN asiento_lineas al ON al."cuentaContableId" = cc.id AND al."isActive" = true
      JOIN asientos_contables ac ON ac.id = al."asientoId"
        AND ac.estado = 'contabilizado' AND ac."isActive" = true
        AND ac.fecha BETWEEN $2 AND $3 AND ac."empresaId" = $1
      WHERE cc."isActive" = true AND cc."empresaId" = $1 AND cc."permiteMovimientos" = true
        AND cc."tipoGasto606" IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM cuenta_anexo_ir2 ca
          WHERE ca."cuentaContableId" = cc.id AND ca."isActive" = true
        )
      GROUP BY cc.id, cc.codigo, cc.nombre, cc.tipo
      HAVING COALESCE(SUM(CASE WHEN cc.naturaleza = 'deudora' THEN al.debe - al.haber ELSE al.haber - al.debe END), 0) != 0
      ORDER BY cc.codigo
      `,
      [eid, desde, hasta],
    );
    return rows.map((r) => ({ codigo: r.codigo, nombre: r.nombre, tipo: r.tipo, saldo: Number(r.saldo) }));
  }

  // ── Anexo J: cantidad y monto por tipo de comprobante, sumando el 606 del ejercicio ──
  private async anexoJPorTipoComprobante(eid: number, desde: string, hasta: string) {
    const rows = await this.dataSource.query<{ tipo: string; cantidad: string; monto: string }[]>(
      `
      SELECT tipo, COUNT(*)::int AS cantidad, COALESCE(SUM(monto), 0)::numeric AS monto
      FROM (
        SELECT UPPER(SUBSTRING(c."numeroFacturaProveedor" FROM 1 FOR 3)) AS tipo, c.total::numeric AS monto
        FROM compras c
        WHERE c."empresaId" = $1 AND c.fecha BETWEEN $2 AND $3
          AND c."isActive" = true AND c.estado IN ('recibida', 'pagada')
          AND c."numeroFacturaProveedor" IS NOT NULL AND c."numeroFacturaProveedor" != ''
        UNION ALL
        SELECT UPPER(SUBSTRING(g.comprobante FROM 1 FOR 3)) AS tipo, g.total::numeric AS monto
        FROM gastos g
        WHERE g."empresaId" = $1 AND g.fecha BETWEEN $2 AND $3
          AND g."isActive" = true AND g.categoria != 'gasto_menor'
          AND g.comprobante IS NOT NULL AND g.comprobante != ''
          AND g."rncProveedor" IS NOT NULL AND g."rncProveedor" != ''
          AND g."tipoBienes" IS NOT NULL AND g."formaPago" IS NOT NULL
      ) x
      WHERE tipo IS NOT NULL AND tipo != ''
      GROUP BY tipo
      ORDER BY tipo
      `,
      [eid, desde, hasta],
    );
    return rows.map((r) => ({ tipoComprobante: r.tipo, cantidad: Number(r.cantidad), monto: Number(r.monto) }));
  }
}
