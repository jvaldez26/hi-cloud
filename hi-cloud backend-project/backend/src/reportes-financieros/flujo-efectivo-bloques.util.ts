/**
 * Estado de Flujo de Efectivo — método indirecto (2026-09-22). Construcción
 * PURA (sin DB) de los tres bloques (Operaciones, Inversiones,
 * Financiamientos) a partir de tres fotos de SaldosCuentasService — misma
 * fuente de verdad que Balance General/Estado de Resultados:
 *
 *   - saldosInicio:  obtenerSaldos(eid, undefined, fechaInicio - 1 día) — saldo
 *                     ACUMULADO a esa fecha (balance sheet point-in-time).
 *   - saldosFin:      obtenerSaldos(eid, undefined, hasta) — mismo, a la fecha de corte.
 *   - saldosPeriodo:  obtenerSaldos(eid, desde, hasta) — MOVIMIENTO del rango
 *                     (P&L: de aquí salen Resultado Neto y Depreciación del período).
 *
 * Resultado Neto se calcula aquí con la MISMA fórmula que
 * BalanceGeneralDetalladoService.resultadoNeto()/EstadoResultadosDetalladoService.
 * gananciaPerdidaDelPeriodo() (Σingreso − Σcosto − Σgasto) — mismo origen de
 * saldos (saldosPeriodo = obtenerSaldos(eid, desde, hasta), idéntico a los
 * otros dos), así que da el MISMO valor por construcción, sin acoplar este
 * servicio a los otros dos (misma decisión de diseño que ya toma el
 * comentario de balance-general-detallado.service.ts:134-137: duplicar la
 * fórmula de 8 líneas en vez de compartir un servicio).
 *
 * Cada línea de variación de balance (CxC, Inventarios, CxP, Impuestos,
 * Activos Fijos, Inversiones, Préstamos, Capital) suma por PREFIJO de código
 * de cuenta — mismo criterio que el resto de Reportes Financieros v2: el
 * catálogo es la fuente de agrupación, no un mapeo hardcodeado por nombre.
 */

export interface CuentaSaldoFlujo {
  codigo:     string;
  nombre:     string;
  tipo:       string; // 'activo' | 'pasivo' | 'patrimonio' | 'ingreso' | 'costo' | 'gasto'
  saldo:      number; // firmado por naturaleza — mismo shape que LineaSaldoCuenta
}

export interface CuentaFlujoEfectivo {
  codigo: string;
  nombre: string;
  /** Contribución YA firmada (con el signo que le corresponde en esta línea) */
  monto:  number;
}

export interface LineaFlujoEfectivo {
  nombre:  string;
  monto:   number;
  cuentas: CuentaFlujoEfectivo[];
}

export interface BloqueFlujoEfectivo {
  nombre: string;
  lineas: LineaFlujoEfectivo[];
  total:  number;
}

export interface FlujoEfectivoPeriodo {
  resultadoNeto:        number;
  operaciones:          BloqueFlujoEfectivo; // incluye Resultado Neto como primera línea + Ajustes
  inversiones:          BloqueFlujoEfectivo;
  financiamientos:      BloqueFlujoEfectivo;
  cambioNetoEfectivo:   number;
  efectivoInicio:       number;
  efectivoFin:          number;
  /** efectivoFin − (efectivoInicio + cambioNetoEfectivo) — la "regla de oro"; debe ser 0 */
  diferenciaCuadre:     number;
  cuadrado:             boolean;
}

/** Suma el saldo de las cuentas cuyo código empieza por alguno de los prefijos dados. */
function sumarPorPrefijo(saldos: CuentaSaldoFlujo[], prefijos: string[]): number {
  return +saldos
    .filter(c => prefijos.some(p => c.codigo === p || c.codigo.startsWith(p + '.')))
    .reduce((s, c) => s + c.saldo, 0)
    .toFixed(2);
}

/** Cuentas individuales que matchean los prefijos, con su contribución ya firmada — para la vista "Detallado". */
function cuentasVariacion(
  inicio: CuentaSaldoFlujo[], fin: CuentaSaldoFlujo[], prefijos: string[], signo: 1 | -1,
): CuentaFlujoEfectivo[] {
  const codigos = new Set([...inicio, ...fin]
    .filter(c => prefijos.some(p => c.codigo === p || c.codigo.startsWith(p + '.')))
    .map(c => c.codigo));
  const porCodigo = (arr: CuentaSaldoFlujo[]) => new Map(arr.map(c => [c.codigo, c]));
  const mapaInicio = porCodigo(inicio);
  const mapaFin    = porCodigo(fin);
  return [...codigos].sort().map(codigo => {
    const nombre = mapaFin.get(codigo)?.nombre ?? mapaInicio.get(codigo)?.nombre ?? codigo;
    const variacion = (mapaFin.get(codigo)?.saldo ?? 0) - (mapaInicio.get(codigo)?.saldo ?? 0);
    return { codigo, nombre, monto: +(variacion * signo).toFixed(2) };
  });
}

/** Línea de variación de balance: saldoFinal − saldoInicial, con el signo que le toca en el reporte. */
function lineaVariacion(
  nombre: string, inicio: CuentaSaldoFlujo[], fin: CuentaSaldoFlujo[], prefijos: string[], signo: 1 | -1,
): LineaFlujoEfectivo {
  const variacion = sumarPorPrefijo(fin, prefijos) - sumarPorPrefijo(inicio, prefijos);
  return { nombre, monto: +(variacion * signo).toFixed(2), cuentas: cuentasVariacion(inicio, fin, prefijos, signo) };
}

function bloque(nombre: string, lineas: LineaFlujoEfectivo[]): BloqueFlujoEfectivo {
  return { nombre, lineas, total: +lineas.reduce((s, l) => s + l.monto, 0).toFixed(2) };
}

// ── Prefijos del catálogo — ver PASO 0 (contabilidad.service.ts) ───────────
const PFX_EFECTIVO      = ['1.1.1'];              // Caja + Bancos
const PFX_CLIENTES       = ['1.1.2.01'];            // Clientes (no todo 1.1.2 — excluye CxC empleados/accionistas/otros)
const PFX_MERCANCIAS     = ['1.1.3.01'];            // Mercancías para la Venta
const PFX_PROVEEDORES    = ['2.1.1.01'];            // Proveedores
const PFX_IMPUESTOS      = ['2.1.2.01', '2.1.2.02']; // ITBIS + ISR por Pagar
const PFX_ACTIVOS_FIJOS  = ['1.2.1'];               // Propiedades, Planta y Equipo — a costo (no la depreciación acumulada, 1.2.2)
const PFX_INVERSIONES    = ['1.1.5', '1.2.3'];      // Inversiones temporales (CP) + a largo plazo
const PFX_PRESTAMOS      = ['2.2.1'];               // Préstamos y Financiamientos LP
const PFX_CAPITAL        = ['3.1'];                 // Capital Social — NUNCA 3.2 (Resultados/utilidades retenidas, ya está en Resultado Neto)

/** Gasto de depreciación del período — dos familias conviven en el catálogo (ver PASO 0): la cuenta legacy única 6.1.2.05 y el grupo 6.2.1.* por clase. */
function depreciacionDelPeriodo(saldosPeriodo: CuentaSaldoFlujo[]): number {
  return +saldosPeriodo
    .filter(c => c.tipo === 'gasto' && (c.codigo === '6.1.2.05' || c.codigo.startsWith('6.2.1')))
    .reduce((s, c) => s + c.saldo, 0)
    .toFixed(2);
}

/** Misma fórmula que BalanceGeneralDetalladoService.resultadoNeto() — Σingreso − Σcosto − Σgasto del rango. */
function resultadoNetoDelPeriodo(saldosPeriodo: CuentaSaldoFlujo[]): number {
  const ingresos = saldosPeriodo.filter(c => c.tipo === 'ingreso').reduce((s, c) => s + c.saldo, 0);
  const costos   = saldosPeriodo.filter(c => c.tipo === 'costo').reduce((s, c) => s + c.saldo, 0);
  const gastos   = saldosPeriodo.filter(c => c.tipo === 'gasto').reduce((s, c) => s + c.saldo, 0);
  return +(ingresos - costos - gastos).toFixed(2);
}

export function construirFlujoEfectivo(
  saldosInicio:  CuentaSaldoFlujo[],
  saldosFin:     CuentaSaldoFlujo[],
  saldosPeriodo: CuentaSaldoFlujo[],
): FlujoEfectivoPeriodo {
  const resultadoNeto = resultadoNetoDelPeriodo(saldosPeriodo);
  const depreciacion  = depreciacionDelPeriodo(saldosPeriodo);

  const lineaResultadoNeto: LineaFlujoEfectivo = { nombre: 'Resultado Neto', monto: resultadoNeto, cuentas: [] };
  const lineaDepreciacion: LineaFlujoEfectivo = {
    nombre: 'Depreciaciones del período', monto: depreciacion,
    cuentas: saldosPeriodo
      .filter(c => c.tipo === 'gasto' && (c.codigo === '6.1.2.05' || c.codigo.startsWith('6.2.1')))
      .map(c => ({ codigo: c.codigo, nombre: c.nombre, monto: c.saldo })),
  };

  const operaciones = bloque('Flujo de Efectivo de las Operaciones', [
    lineaResultadoNeto,
    lineaDepreciacion,
    lineaVariacion('Aumento en Cuentas por Cobrar',  saldosInicio, saldosFin, PFX_CLIENTES,    -1),
    lineaVariacion('Aumento en Inventarios',          saldosInicio, saldosFin, PFX_MERCANCIAS,  -1),
    lineaVariacion('Aumento en Cuentas por Pagar',    saldosInicio, saldosFin, PFX_PROVEEDORES,  1),
    lineaVariacion('Aumento en Impuestos por Pagar',  saldosInicio, saldosFin, PFX_IMPUESTOS,    1),
  ]);

  const inversiones = bloque('Efectivo Neto Generado por Inversiones', [
    lineaVariacion('Aumento en Propiedades y Equipos', saldosInicio, saldosFin, PFX_ACTIVOS_FIJOS, -1),
    lineaVariacion('Aumento en Inversiones',            saldosInicio, saldosFin, PFX_INVERSIONES,   -1),
  ]);

  const financiamientos = bloque('Flujo de Efectivo de los Financiamientos', [
    lineaVariacion('Aumento en Préstamos', saldosInicio, saldosFin, PFX_PRESTAMOS, 1),
    lineaVariacion('Aumento en Capital',    saldosInicio, saldosFin, PFX_CAPITAL,   1),
  ]);

  const cambioNetoEfectivo = +(operaciones.total + inversiones.total + financiamientos.total).toFixed(2);
  const efectivoInicio = sumarPorPrefijo(saldosInicio, PFX_EFECTIVO);
  const efectivoFin    = sumarPorPrefijo(saldosFin, PFX_EFECTIVO);
  const diferenciaCuadre = +(efectivoFin - (efectivoInicio + cambioNetoEfectivo)).toFixed(2);

  return {
    resultadoNeto, operaciones, inversiones, financiamientos,
    cambioNetoEfectivo, efectivoInicio, efectivoFin,
    diferenciaCuadre, cuadrado: Math.abs(diferenciaCuadre) < 0.01,
  };
}

// ─── Aplanado para exportación (Excel/CSV/PDF) ─────────────────────────────

export interface FilaFlujoEfectivo {
  bloque:    string;
  codigo:    string;
  nombre:    string;
  monto:     number;
  esTotal:   boolean;
}

function filasBloque(b: BloqueFlujoEfectivo): FilaFlujoEfectivo[] {
  const filas: FilaFlujoEfectivo[] = b.lineas.map(l => ({
    bloque: b.nombre, codigo: '', nombre: l.nombre, monto: l.monto, esTotal: false,
  }));
  filas.push({ bloque: b.nombre, codigo: '', nombre: `Total ${b.nombre}`, monto: b.total, esTotal: true });
  return filas;
}

/** Orden EXACTO de la estructura pedida. */
export function aplanarFlujoEfectivo(periodo: FlujoEfectivoPeriodo): FilaFlujoEfectivo[] {
  return [
    ...filasBloque(periodo.operaciones),
    ...filasBloque(periodo.inversiones),
    ...filasBloque(periodo.financiamientos),
    { bloque: '', codigo: '', nombre: 'CAMBIO NETO EN EL EFECTIVO Y EQUIVALENTES', monto: periodo.cambioNetoEfectivo, esTotal: true },
    { bloque: '', codigo: '', nombre: 'Efectivo al Inicio del Período', monto: periodo.efectivoInicio, esTotal: false },
    { bloque: '', codigo: '', nombre: 'EFECTIVO AL FINAL DEL PERÍODO', monto: periodo.efectivoFin, esTotal: true },
  ];
}
