import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { TenantService } from '../tenant/tenant.service';

/**
 * Líneas que el IR-2 espera en el Anexo A1 y que HiCloud no tiene forma de
 * calcular — ningún módulo del ERP las registra. Se devuelven en cero y
 * marcadas como llenado manual: mejor una línea vacía y honesta que un
 * cero que parezca un dato real. Constante de módulo, no propiedad de
 * clase — una propiedad de clase con inicializador solo se llena en el
 * constructor real, y este servicio se testea vía
 * `Object.create(AnexosIR2Service.prototype)` (mismo patrón que el resto
 * del backend), que nunca lo ejecuta.
 */
const CONCEPTOS_MANUALES_A1 = [
  { concepto: 'Revaluación de activos', motivo: 'El ERP no registra revaluaciones de activos fijos — no existe ningún módulo que las capture.' },
  { concepto: 'Dividendos a cuenta', motivo: 'El ERP no registra distribuciones de dividendos a cuenta de utilidades.' },
  { concepto: 'Aportes para futura capitalización', motivo: 'El ERP no registra aportes de socios pendientes de capitalizar.' },
];

/**
 * FASE 4 del catálogo fiscal dominicano — genera los Anexos del IR-2 a
 * partir de las etiquetas fiscales de Fase 1/2 y la relación multi-valor
 * de Fase 4 Bloque A (`cuenta_anexo_ir2`). Un anexo por método (getAnexoA1
 * Bloque B, getAnexoB1 Bloque C, getAnexoD Bloque D) — todos comparten el
 * mismo criterio: solo se llenan las líneas que el ERP puede respaldar con
 * datos reales. Lo que el ERP no registra en absoluto queda en cero y
 * marcado `llenadoManual: true` — nunca se inventa un valor para que la
 * línea "no se vea vacía".
 *
 * FASE 4 Bloque E (investigación previa a construir cualquier export):
 * DGII no tiene mecanismo de carga de archivo para el IR-2 ni sus anexos
 * (instructivo oficial vigente, marzo/junio 2026 — a diferencia del 606/
 * 607/608, que sí se suben como TXT). Todo apunta a llenado manual en el
 * formulario web de la Oficina Virtual; DGII distribuye su propia plantilla
 * Excel con macros solo como herramienta de CÁLCULO previo, nunca como
 * archivo que se sube. Por eso estos métodos alimentan pantallas + export a
 * Excel de TRABAJO INTERNO (mismo rol que la plantilla oficial de DGII) —
 * no un archivo de envío. No construir ningún "subir a DGII" sobre esto.
 */
@Injectable()
export class AnexosIR2Service {
  constructor(
    private dataSource: DataSource,
    private tenantSvc: TenantService,
  ) {}

  private get eid(): number {
    return this.tenantSvc.getEmpresaId();
  }

  // ── Anexo A1 — Balance General ─────────────────────────────────────────

  async getAnexoA1(fechaCorte: string) {
    const eid = this.eid;

    const [conA1, sinA1] = await Promise.all([
      this.cuentasConAnexoA1(eid, fechaCorte),
      this.cuentasDeBalanceSinAnexoA1(eid, fechaCorte),
    ]);

    const activo      = conA1.filter((c) => c.tipo === 'activo');
    const pasivo       = conA1.filter((c) => c.tipo === 'pasivo');
    const patrimonio    = conA1.filter((c) => c.tipo === 'patrimonio');

    const activoCorriente   = activo.filter((c) => c.codigo.startsWith('1.1'));
    const activoNoCorriente = activo.filter((c) => c.codigo.startsWith('1.2'));
    const pasivoCorriente   = pasivo.filter((c) => c.codigo.startsWith('2.1'));
    const pasivoNoCorriente = pasivo.filter((c) => c.codigo.startsWith('2.2'));

    const sumar = (cuentas: { saldo: number }[]) => +cuentas.reduce((s, c) => s + c.saldo, 0).toFixed(2);

    const totalActivo      = sumar(activo);
    const totalPasivo      = sumar(pasivo);
    const totalPatrimonio  = sumar(patrimonio);
    const ecuacion         = +(totalActivo - (totalPasivo + totalPatrimonio)).toFixed(2);

    return {
      fechaCorte,
      activo: {
        corriente:   { cuentas: activoCorriente,   total: sumar(activoCorriente) },
        noCorriente: { cuentas: activoNoCorriente, total: sumar(activoNoCorriente) },
        total:       totalActivo,
      },
      pasivo: {
        corriente:   { cuentas: pasivoCorriente,   total: sumar(pasivoCorriente) },
        noCorriente: { cuentas: pasivoNoCorriente, total: sumar(pasivoNoCorriente) },
        total:       totalPasivo,
      },
      patrimonio: { cuentas: patrimonio, total: totalPatrimonio },
      totales: {
        activos:           totalActivo,
        pasivosPatrimonio: +(totalPasivo + totalPatrimonio).toFixed(2),
        ecuacion,
        cuadrado:          Math.abs(ecuacion) < 0.01,
      },
      lineasLlenadoManual: CONCEPTOS_MANUALES_A1.map((c) => ({ ...c, valor: 0, llenadoManual: true })),
      alertas: {
        // Cuentas de balance (activo/pasivo/patrimonio) con saldo a la fecha
        // de corte que NO tienen la etiqueta A1 — el seed las etiqueta todas,
        // así que esto solo debería aparecer en cuentas creadas a mano sin
        // pasar por el catálogo fiscal. Si aparece algo aquí, el total de
        // este anexo NO incluye esas cuentas — quedan fuera del A1 hasta que
        // se etiqueten, no se les asigna una etiqueta a la fuerza.
        cuentasDeBalanceSinEtiquetaA1: sinA1,
      },
      procedencia:
        'Armado a partir de las cuentas etiquetadas con Anexo A1 (Fase 4 Bloque A) y sus asientos ' +
        'contabilizados hasta la fecha de corte — mismo criterio que el Balance General de Reportes ' +
        'Financieros, filtrado a las cuentas que aportan al IR-2.',
    };
  }

  private async cuentasConAnexoA1(eid: number, fechaCorte: string) {
    // FIX 3, COMMIT 3 (2026-09-20) — mismo bug del PASO 0: los filtros de
    // asientos_contables vivían en el ON de un LEFT JOIN contra
    // asiento_lineas, que no los aplica como filtro real (un asiento
    // anulado/de otra empresa/inactivo/fuera de fecha seguía sumándose). Se
    // pre-filtran en un INNER JOIN dentro de una subconsulta, que sí actúa
    // como filtro, y esa subconsulta ya filtrada se LEFT JOINea contra cc.
    const rows = await this.dataSource.query<any[]>(
      `
      SELECT cc.codigo, cc.nombre, cc.tipo, cc.naturaleza, ca."casillaIR2" AS "casillaIR2",
             COALESCE(SUM(CASE WHEN cc.naturaleza = 'deudora' THEN m.debe - m.haber ELSE m.haber - m.debe END), 0)::numeric AS saldo
      FROM cuentas_contables cc
      JOIN cuenta_anexo_ir2 ca ON ca."cuentaContableId" = cc.id AND ca."isActive" = true AND ca."anexoIR2" = 'A1'
      LEFT JOIN (
        SELECT al."cuentaContableId", al.debe, al.haber
        FROM asiento_lineas al
        JOIN asientos_contables ac ON ac.id = al."asientoId"
          AND ac.estado = 'contabilizado' AND ac."isActive" = true
          AND ac."empresaId" = $1 AND ac.fecha <= $2
        WHERE al."isActive" = true
      ) m ON m."cuentaContableId" = cc.id
      WHERE cc."isActive" = true AND cc."empresaId" = $1 AND cc."permiteMovimientos" = true
      GROUP BY cc.id, cc.codigo, cc.nombre, cc.tipo, cc.naturaleza, ca."casillaIR2"
      HAVING COALESCE(SUM(CASE WHEN cc.naturaleza = 'deudora' THEN m.debe - m.haber ELSE m.haber - m.debe END), 0) != 0
      ORDER BY cc.codigo
      `,
      [eid, fechaCorte],
    );
    return rows.map((r) => ({
      codigo: r.codigo, nombre: r.nombre, tipo: r.tipo, naturaleza: r.naturaleza,
      casillaIR2: r.casillaIR2, saldo: Number(r.saldo),
    }));
  }

  // ── Anexo B1 — Estado de Resultados ────────────────────────────────────

  /**
   * FASE 4 Bloque C. Ahora que el costo de venta sí se contabiliza (asiento
   * de factura, COD.COSTO_VENTAS), la línea de costos tiene dato real por
   * primera vez — pero solo para productos con historial de compra (AVCO).
   * Un producto vendido sin costoUnitario conocido NO genera línea de costo
   * (ver resolverCostoVenta() en asientos-automaticos.service.ts) — la
   * alerta `ventasSinHistorialCosto` avisa con el monto afectado para que
   * el contador sepa que el costo de este período puede estar subestimado,
   * en vez de dejarlo asumir que el número que ve ya es el correcto.
   *
   * El ISR estimado que sí calcula ReportesFinancierosService (27% sobre
   * utilidad contable) NO se incluye en este anexo a propósito: el ISR real
   * se calcula sobre la renta imponible FISCAL, no la utilidad contable, y
   * eso exige una conciliación entre resultado contable y fiscal (gastos no
   * deducibles, depreciación fiscal vs contable, etc.) que el ERP no hace.
   * Meter aquí el 27% sería presentar una estimación contable como si fuera
   * el dato fiscal del anexo — el campo `isr` lo deja explícito en vez de
   * omitirlo en silencio.
   */
  async getAnexoB1(desde: string, hasta: string) {
    const eid = this.eid;

    const [conB1, sinB1, ventasSinCosto] = await Promise.all([
      this.cuentasConAnexoB1(eid, desde, hasta),
      this.cuentasDeResultadosSinAnexoB1(eid, desde, hasta),
      this.ventasSinHistorialCosto(eid, desde, hasta),
    ]);

    const ingresos = conB1.filter((c) => c.tipo === 'ingreso');
    const costos   = conB1.filter((c) => c.tipo === 'costo');
    const gastos   = conB1.filter((c) => c.tipo === 'gasto');

    const sumar = (cuentas: { saldo: number }[]) => +cuentas.reduce((s, c) => s + c.saldo, 0).toFixed(2);

    const totalIngresos = sumar(ingresos);
    const totalCostos   = sumar(costos);
    const totalGastos   = sumar(gastos);
    const utilidadBruta = +(totalIngresos - totalCostos).toFixed(2);
    const utilidadNeta  = +(utilidadBruta - totalGastos).toFixed(2);
    const margenBruto   = totalIngresos > 0 ? +((utilidadBruta / totalIngresos) * 100).toFixed(1) : 0;
    const margenNeto    = totalIngresos > 0 ? +((utilidadNeta / totalIngresos) * 100).toFixed(1) : 0;

    const cantidadVentasAfectadas = ventasSinCosto.length;
    const montoVentasAfectado = +ventasSinCosto.reduce((s, f) => s + f.monto, 0).toFixed(2);

    return {
      periodo: { desde, hasta },
      ingresos: { cuentas: ingresos, total: totalIngresos },
      costos:   { cuentas: costos,   total: totalCostos },
      gastos:   { cuentas: gastos,   total: totalGastos },
      resultados: { utilidadBruta, totalGastos, utilidadNeta, margenBruto, margenNeto },
      isr: {
        incluido: false,
        motivo:
          'El ISR se calcula sobre la renta imponible fiscal, no sobre la utilidad contable — requiere una ' +
          'conciliación entre resultado contable y fiscal (gastos no deducibles, depreciación fiscal, etc.) ' +
          'que el ERP no hace. Este anexo no estima un ISR.',
      },
      alertas: {
        // Mismo criterio que la alerta homóloga del Anexo A1: cuentas de
        // ingreso/costo/gasto con saldo en el período pero sin etiqueta B1
        // quedan FUERA de los totales de arriba — no se les fuerza una
        // etiqueta ni se cuelan en silencio.
        cuentasDeResultadosSinEtiquetaB1: sinB1,
        ventasSinHistorialCosto: {
          cantidadFacturas: cantidadVentasAfectadas,
          montoAfectado: montoVentasAfectado,
          facturas: ventasSinCosto,
          nota: cantidadVentasAfectadas > 0
            ? `${cantidadVentasAfectadas} factura(s) de este período vendieron un producto sin costo conocido ` +
              `(nunca recibió una compra) — el costo de venta de este anexo NO incluye esas líneas, así que ` +
              `puede estar subestimado en hasta ${montoVentasAfectado.toFixed(2)}.`
            : 'Todas las ventas del período tienen costo conocido — ninguna línea de costo quedó fuera.',
        },
      },
      procedencia:
        'Armado a partir de las cuentas etiquetadas con Anexo B1 (Fase 4 Bloque A) y sus asientos ' +
        'contabilizados en el período — mismo criterio que el Estado de Resultados de Reportes ' +
        'Financieros, filtrado a las cuentas que aportan al IR-2 y sin el ISR estimado.',
    };
  }

  private async cuentasConAnexoB1(eid: number, desde: string, hasta: string) {
    // FIX 3, COMMIT 3 (2026-09-20) — ver el comentario de cuentasConAnexoA1().
    const rows = await this.dataSource.query<any[]>(
      `
      SELECT cc.codigo, cc.nombre, cc.tipo, cc.naturaleza, ca."casillaIR2" AS "casillaIR2",
             COALESCE(SUM(CASE WHEN cc.naturaleza = 'deudora' THEN m.debe - m.haber ELSE m.haber - m.debe END), 0)::numeric AS saldo
      FROM cuentas_contables cc
      JOIN cuenta_anexo_ir2 ca ON ca."cuentaContableId" = cc.id AND ca."isActive" = true AND ca."anexoIR2" = 'B1'
      LEFT JOIN (
        SELECT al."cuentaContableId", al.debe, al.haber
        FROM asiento_lineas al
        JOIN asientos_contables ac ON ac.id = al."asientoId"
          AND ac.estado = 'contabilizado' AND ac."isActive" = true
          AND ac."empresaId" = $1 AND ac.fecha BETWEEN $2 AND $3
        WHERE al."isActive" = true
      ) m ON m."cuentaContableId" = cc.id
      WHERE cc."isActive" = true AND cc."empresaId" = $1 AND cc."permiteMovimientos" = true
      GROUP BY cc.id, cc.codigo, cc.nombre, cc.tipo, cc.naturaleza, ca."casillaIR2"
      HAVING COALESCE(SUM(CASE WHEN cc.naturaleza = 'deudora' THEN m.debe - m.haber ELSE m.haber - m.debe END), 0) != 0
      ORDER BY cc.codigo
      `,
      [eid, desde, hasta],
    );
    return rows.map((r) => ({
      codigo: r.codigo, nombre: r.nombre, tipo: r.tipo, naturaleza: r.naturaleza,
      casillaIR2: r.casillaIR2, saldo: Number(r.saldo),
    }));
  }

  private async cuentasDeResultadosSinAnexoB1(eid: number, desde: string, hasta: string) {
    // FIX 3, COMMIT 3 (2026-09-20) — ver el comentario de cuentasConAnexoA1().
    const rows = await this.dataSource.query<any[]>(
      `
      SELECT cc.codigo, cc.nombre, cc.tipo,
             COALESCE(SUM(CASE WHEN cc.naturaleza = 'deudora' THEN m.debe - m.haber ELSE m.haber - m.debe END), 0)::numeric AS saldo
      FROM cuentas_contables cc
      LEFT JOIN (
        SELECT al."cuentaContableId", al.debe, al.haber
        FROM asiento_lineas al
        JOIN asientos_contables ac ON ac.id = al."asientoId"
          AND ac.estado = 'contabilizado' AND ac."isActive" = true
          AND ac."empresaId" = $1 AND ac.fecha BETWEEN $2 AND $3
        WHERE al."isActive" = true
      ) m ON m."cuentaContableId" = cc.id
      WHERE cc."isActive" = true AND cc."empresaId" = $1 AND cc."permiteMovimientos" = true
        AND cc.tipo IN ('ingreso', 'costo', 'gasto')
        AND NOT EXISTS (
          SELECT 1 FROM cuenta_anexo_ir2 ca
          WHERE ca."cuentaContableId" = cc.id AND ca."isActive" = true AND ca."anexoIR2" = 'B1'
        )
      GROUP BY cc.id, cc.codigo, cc.nombre, cc.tipo
      HAVING COALESCE(SUM(CASE WHEN cc.naturaleza = 'deudora' THEN m.debe - m.haber ELSE m.haber - m.debe END), 0) != 0
      ORDER BY cc.codigo
      `,
      [eid, desde, hasta],
    );
    return rows.map((r) => ({ codigo: r.codigo, nombre: r.nombre, tipo: r.tipo, saldo: Number(r.saldo) }));
  }

  /** Facturas del período con al menos una línea de producto sin costoUnitario conocido (ver resolverCostoVenta()). */
  private async ventasSinHistorialCosto(eid: number, desde: string, hasta: string) {
    const rows = await this.dataSource.query<any[]>(
      `
      SELECT f.id, f.folio, f.fecha::text,
             COUNT(*) FILTER (WHERE fd."productoId" IS NOT NULL AND fd."costoUnitario" = 0) AS lineas,
             COALESCE(SUM(fd.subtotal) FILTER (WHERE fd."productoId" IS NOT NULL AND fd."costoUnitario" = 0), 0)::numeric AS monto
      FROM facturas f
      JOIN factura_detalles fd ON fd."facturaId" = f.id
      WHERE f."empresaId" = $1 AND f.fecha BETWEEN $2 AND $3
        AND f."isActive" = true AND f.estado IN ('emitida', 'pagada')
      GROUP BY f.id, f.folio, f.fecha
      HAVING COUNT(*) FILTER (WHERE fd."productoId" IS NOT NULL AND fd."costoUnitario" = 0) > 0
      ORDER BY f.fecha
      `,
      [eid, desde, hasta],
    );
    return rows.map((r) => ({
      id: r.id, folio: r.folio, fecha: String(r.fecha).substring(0, 10),
      lineasSinCosto: Number(r.lineas), monto: Number(r.monto),
    }));
  }

  // ── Anexo D — Costo de Venta ───────────────────────────────────────────

  /**
   * FASE 4 Bloque D. El Anexo D pide: Inventario Inicial + Compras Locales
   * + Compras del Exterior + ITBIS Llevado al Costo − Inventario Final =
   * Costo de Venta.
   *
   * Lo que el ERP SÍ puede calcular con datos reales:
   *   - Inventario Inicial/Final: saldo de las cuentas etiquetadas D de
   *     tipo activo (Inventario) al cierre del año anterior y del propio
   *     ejercicio.
   *   - Compras totales del ejercicio (mismo universo que el Formato 606).
   *   - "Compras con gasto de importación asociado": un PROXY real (compras
   *     con al menos un flete/seguro/arancel/agente aduanal/almacenaje
   *     aplicado vía gastos_importacion) — no una clasificación oficial de
   *     origen, porque Compra/CompraDetalle no tienen ningún campo que
   *     distinga compra local de importación.
   *
   * Lo que el ERP NO puede calcular — van en cero, marcadas llenadoManual:
   *   - Compras Locales / Compras del Exterior: no hay campo de origen; se
   *     entregan los dos números de arriba como referencia para que el
   *     contador reparta.
   *   - ITBIS Llevado al Costo: ningún módulo calcula ITBIS no acreditable
   *     capitalizado al costo del inventario (compras.service.ts,
   *     gastos-importacion.service.ts) — no existe en absoluto.
   *
   * ADVERTENCIA explícita (pedida punto por punto): la cuenta de Inventario
   * venía creciendo de forma monótona ANTES de que el costo de venta se
   * contabilizara (P3/costo de venta llegó después) — el saldo de apertura
   * de un ejercicio puede arrastrar ese desvío acumulado. Esto no es algo
   * que el ERP pueda detectar ni corregir solo: se advierte siempre, el
   * contador es quien lo contrasta contra el inventario físico.
   */
  async getAnexoD(anio: number) {
    const eid = this.eid;
    const desde = `${anio}-01-01`;
    const hasta = `${anio}-12-31`;
    const cierreAnioAnterior = `${anio - 1}-12-31`;

    const [inventarioInicial, inventarioFinal, comprasTotales, comprasConImportacion] = await Promise.all([
      this.saldoCuentasInventarioD(eid, cierreAnioAnterior),
      this.saldoCuentasInventarioD(eid, hasta),
      this.comprasTotalesPeriodo(eid, desde, hasta),
      this.comprasConGastoImportacion(eid, desde, hasta),
    ]);

    const costoVentaCalculado = +(inventarioInicial.total + comprasTotales - inventarioFinal.total).toFixed(2);

    return {
      periodo: { anio, desde, hasta },
      inventarioInicial: {
        cuentas: inventarioInicial.cuentas,
        total: inventarioInicial.total,
        procedencia: `Saldo de las cuentas de Inventario etiquetadas con Anexo D al cierre de ${anio - 1} (${cierreAnioAnterior}).`,
      },
      inventarioFinal: {
        cuentas: inventarioFinal.cuentas,
        total: inventarioFinal.total,
        procedencia: `Saldo de las cuentas de Inventario etiquetadas con Anexo D al cierre del ejercicio (${hasta}).`,
      },
      compras: {
        totalPeriodo: comprasTotales,
        conGastoImportacionAsociado: comprasConImportacion,
        procedencia:
          'Suma de compras recibidas/pagadas del ejercicio (mismo universo que el Formato 606). El ERP no ' +
          'distingue compra local de importación a nivel de registro — "con gasto de importación asociado" es ' +
          'un proxy real (compras con al menos un flete/seguro/arancel/agente aduanal/almacenaje aplicado), no ' +
          'una clasificación oficial de origen.',
      },
      costoVentaCalculado: {
        valor: costoVentaCalculado,
        formula: 'Inventario Inicial + Compras Totales − Inventario Final',
        nota: 'No incluye ITBIS Llevado al Costo (línea de llenado manual, abajo) ni el reparto Local/Exterior de las compras.',
      },
      lineasLlenadoManual: [
        {
          concepto: 'Compras Locales', valor: 0,
          motivo: `El ERP no registra el origen de la compra. Usa "Compras totales" (${comprasTotales.toFixed(2)}) y ` +
            `"con gasto de importación asociado" (${comprasConImportacion.toFixed(2)}) como referencia para repartir.`,
        },
        {
          concepto: 'Compras del Exterior', valor: 0,
          motivo: `El ERP no registra el origen de la compra. Usa "Compras totales" (${comprasTotales.toFixed(2)}) y ` +
            `"con gasto de importación asociado" (${comprasConImportacion.toFixed(2)}) como referencia para repartir.`,
        },
        {
          concepto: 'ITBIS Llevado al Costo', valor: 0,
          motivo: 'El ERP no calcula ITBIS no acreditable capitalizado al costo del inventario — ningún módulo lo registra.',
        },
      ],
      advertencias: {
        saldoAperturaInventario:
          'La cuenta de Inventario venía creciendo de forma monótona antes de que el costo de venta se ' +
          'contabilizara — el saldo de apertura de este ejercicio puede arrastrar ese desvío acumulado. ' +
          'Ajústalo contra el inventario físico antes de declarar; el ERP no puede detectar ni corregir esto solo.',
      },
      procedencia:
        'Inventario inicial/final desde las cuentas etiquetadas con Anexo D (tipo activo) y sus asientos ' +
        'contabilizados; compras desde la tabla de compras del ejercicio, mismo criterio que el Formato 606.',
    };
  }

  private async saldoCuentasInventarioD(eid: number, fechaCorte: string) {
    // FIX 3, COMMIT 3 (2026-09-20) — ver el comentario de cuentasConAnexoA1().
    // Este es el de mayor impacto: alimenta costoVentaCalculado directamente,
    // un número real del anexo, no solo una alerta.
    const rows = await this.dataSource.query<any[]>(
      `
      SELECT cc.codigo, cc.nombre, ca."casillaIR2" AS "casillaIR2",
             COALESCE(SUM(m.debe - m.haber), 0)::numeric AS saldo
      FROM cuentas_contables cc
      JOIN cuenta_anexo_ir2 ca ON ca."cuentaContableId" = cc.id AND ca."isActive" = true AND ca."anexoIR2" = 'D'
      LEFT JOIN (
        SELECT al."cuentaContableId", al.debe, al.haber
        FROM asiento_lineas al
        JOIN asientos_contables ac ON ac.id = al."asientoId"
          AND ac.estado = 'contabilizado' AND ac."isActive" = true
          AND ac."empresaId" = $1 AND ac.fecha <= $2
        WHERE al."isActive" = true
      ) m ON m."cuentaContableId" = cc.id
      WHERE cc."isActive" = true AND cc."empresaId" = $1 AND cc."permiteMovimientos" = true AND cc.tipo = 'activo'
      GROUP BY cc.id, cc.codigo, cc.nombre, ca."casillaIR2"
      ORDER BY cc.codigo
      `,
      [eid, fechaCorte],
    );
    const cuentas = rows.map((r) => ({ codigo: r.codigo, nombre: r.nombre, casillaIR2: r.casillaIR2, saldo: Number(r.saldo) }));
    return { cuentas, total: +cuentas.reduce((s, c) => s + c.saldo, 0).toFixed(2) };
  }

  private async comprasTotalesPeriodo(eid: number, desde: string, hasta: string): Promise<number> {
    const rows = await this.dataSource.query<{ total: string }[]>(
      `
      SELECT COALESCE(SUM(c.total), 0)::numeric AS total
      FROM compras c
      WHERE c."empresaId" = $1 AND c.fecha BETWEEN $2 AND $3
        AND c."isActive" = true AND c.estado IN ('recibida', 'pagada')
      `,
      [eid, desde, hasta],
    );
    return Number(rows[0]?.total ?? 0);
  }

  private async comprasConGastoImportacion(eid: number, desde: string, hasta: string): Promise<number> {
    const rows = await this.dataSource.query<{ total: string }[]>(
      `
      SELECT COALESCE(SUM(c.total), 0)::numeric AS total
      FROM compras c
      WHERE c."empresaId" = $1 AND c.fecha BETWEEN $2 AND $3
        AND c."isActive" = true AND c.estado IN ('recibida', 'pagada')
        AND EXISTS (SELECT 1 FROM gastos_importacion gi WHERE gi."compraId" = c.id AND gi."empresaId" = $1)
      `,
      [eid, desde, hasta],
    );
    return Number(rows[0]?.total ?? 0);
  }

  private async cuentasDeBalanceSinAnexoA1(eid: number, fechaCorte: string) {
    // FIX 3, COMMIT 3 (2026-09-20) — ver el comentario de cuentasConAnexoA1().
    const rows = await this.dataSource.query<any[]>(
      `
      SELECT cc.codigo, cc.nombre, cc.tipo,
             COALESCE(SUM(CASE WHEN cc.naturaleza = 'deudora' THEN m.debe - m.haber ELSE m.haber - m.debe END), 0)::numeric AS saldo
      FROM cuentas_contables cc
      LEFT JOIN (
        SELECT al."cuentaContableId", al.debe, al.haber
        FROM asiento_lineas al
        JOIN asientos_contables ac ON ac.id = al."asientoId"
          AND ac.estado = 'contabilizado' AND ac."isActive" = true
          AND ac."empresaId" = $1 AND ac.fecha <= $2
        WHERE al."isActive" = true
      ) m ON m."cuentaContableId" = cc.id
      WHERE cc."isActive" = true AND cc."empresaId" = $1 AND cc."permiteMovimientos" = true
        AND cc.tipo IN ('activo', 'pasivo', 'patrimonio')
        AND NOT EXISTS (
          SELECT 1 FROM cuenta_anexo_ir2 ca
          WHERE ca."cuentaContableId" = cc.id AND ca."isActive" = true AND ca."anexoIR2" = 'A1'
        )
      GROUP BY cc.id, cc.codigo, cc.nombre, cc.tipo
      HAVING COALESCE(SUM(CASE WHEN cc.naturaleza = 'deudora' THEN m.debe - m.haber ELSE m.haber - m.debe END), 0) != 0
      ORDER BY cc.codigo
      `,
      [eid, fechaCorte],
    );
    return rows.map((r) => ({ codigo: r.codigo, nombre: r.nombre, tipo: r.tipo, saldo: Number(r.saldo) }));
  }
}
