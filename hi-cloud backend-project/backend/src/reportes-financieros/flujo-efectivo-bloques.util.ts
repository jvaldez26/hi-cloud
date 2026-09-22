/**
 * Estado de Flujo de Efectivo — método indirecto (2026-09-22, revisado
 * 2026-09-22 tras un barrido de catálogo). Construcción PURA (sin DB) de
 * los tres bloques (Operaciones, Inversiones, Financiamientos) a partir de
 * tres fotos de SaldosCuentasService — misma fuente de verdad que Balance
 * General/Estado de Resultados:
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
 * saldos, así que da el MISMO valor por construcción, sin acoplar este
 * servicio a los otros dos (misma decisión de diseño que balance-general-
 * detallado.service.ts:134-137: duplicar la fórmula en vez de compartir un
 * servicio).
 *
 * ── El signo de cada línea sale de la NATURALEZA de la cuenta, no del tipo ──
 * Primera versión (2026-09-22, antes del barrido) le daba un signo FIJO a
 * cada grupo entero (ej. "todo 1.1.2 es deudora → -1"). Eso rompe con
 * cuentas contra — 1.1.2.06 "Provisión para Cuentas Incobrables" es
 * ACREEDORA (reduce la CxC) dentro de un grupo mayormente deudora. La regla
 * correcta, que se sostiene sola: SaldosCuentasService ya devuelve `saldo`
 * firmado por naturaleza (deudora → debe−haber, acreedora → haber−debe), así
 * que un aumento de saldo en una cuenta ACREEDORA es, en términos de
 * efectivo, una fuente (+1) exactamente igual que un pasivo creciendo — y un
 * aumento en una cuenta DEUDORA es un uso (-1) exactamente igual que un
 * activo creciendo. Esto no depende de si la cuenta es "activo" o "pasivo"
 * en el catálogo, solo de su naturaleza — por eso `lineaVariacion` ya no
 * recibe un signo a mano: lo deriva de cada cuenta individualmente.
 *
 * ── Excepción: Depreciación Acumulada (1.2.2) ───────────────────────────
 * Es la ÚNICA cuenta de balance excluida a propósito de toda esta lógica
 * (ni de las líneas nombradas ni del catch-all). Su variación en una
 * depreciación normal (sin baja de activo) es SIEMPRE igual al gasto de
 * depreciación del período, que YA se suma de vuelta en "Depreciaciones del
 * período" — incluirla también aquí duplicaría el ajuste (sumaría el mismo
 * efecto dos veces). Verificado con tests: la "regla de oro" cuadra sin
 * ella porque el gasto de depreciación y el crédito a la acumulada son las
 * dos mitades de la MISMA partida, y una ya se está compensando.
 *
 * ── Catch-all — por qué existe ──────────────────────────────────────────
 * El 2026-09-22 un descuadre real (empresa 44) resultó ser una sola cuenta
 * del catálogo (1.1.4 Impuestos Anticipados) que nadie había puesto en
 * ninguna línea. Enumerar cuentas a mano garantiza que TODAS las conocidas
 * hoy tengan línea, pero no protege contra la próxima cuenta nueva del
 * catálogo (o una cuenta rara que una empresa específica sí usa). Por eso,
 * después de armar las líneas nombradas, "Otras variaciones de activos y
 * pasivos" suma con el mismo criterio de naturaleza CUALQUIER cuenta de
 * balance que haya quedado fuera — la regla de oro cuadra por construcción,
 * para cualquier empresa, no solo las que se probaron.
 */

export interface CuentaSaldoFlujo {
  codigo:     string;
  nombre:     string;
  tipo:       string; // 'activo' | 'pasivo' | 'patrimonio' | 'ingreso' | 'costo' | 'gasto'
  naturaleza: string; // 'deudora' | 'acreedora'
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

function coincidePrefijo(codigo: string, prefijos: string[]): boolean {
  return prefijos.some(p => codigo === p || codigo.startsWith(p + '.'));
}

/** +1 si la cuenta es acreedora (crecer es fuente de efectivo, como un pasivo), -1 si es deudora (crecer es uso, como un activo). */
function signoPorNaturaleza(naturaleza: string): 1 | -1 {
  return naturaleza === 'acreedora' ? 1 : -1;
}

function porCodigo(saldos: CuentaSaldoFlujo[]): Map<string, CuentaSaldoFlujo> {
  return new Map(saldos.map(c => [c.codigo, c]));
}

/** Suma el saldo de las cuentas cuyo código empieza por alguno de los prefijos dados (sin firmar por naturaleza — para Efectivo, que no es una línea de ajuste). */
function sumarPorPrefijo(saldos: CuentaSaldoFlujo[], prefijos: string[]): number {
  return +saldos.filter(c => coincidePrefijo(c.codigo, prefijos)).reduce((s, c) => s + c.saldo, 0).toFixed(2);
}

/**
 * Línea de variación de balance para un conjunto de prefijos — cada cuenta
 * dentro del grupo se firma por SU PROPIA naturaleza (ver comentario de
 * cabecera), así que un grupo con cuentas contra (naturaleza distinta al
 * resto del grupo) sigue dando el resultado correcto sin tratamiento especial.
 */
function lineaVariacion(
  nombre: string, inicio: CuentaSaldoFlujo[], fin: CuentaSaldoFlujo[], prefijos: string[],
): LineaFlujoEfectivo {
  const codigos = new Set([...inicio, ...fin].filter(c => coincidePrefijo(c.codigo, prefijos)).map(c => c.codigo));
  const mi = porCodigo(inicio), mf = porCodigo(fin);
  const cuentas = [...codigos].sort().map(codigo => {
    const cFin = mf.get(codigo), cIni = mi.get(codigo);
    const nombreCuenta = cFin?.nombre ?? cIni?.nombre ?? codigo;
    const naturaleza   = cFin?.naturaleza ?? cIni?.naturaleza ?? 'deudora';
    const variacion    = (cFin?.saldo ?? 0) - (cIni?.saldo ?? 0);
    return { codigo, nombre: nombreCuenta, monto: +(variacion * signoPorNaturaleza(naturaleza)).toFixed(2) };
  });
  return { nombre, monto: +cuentas.reduce((s, c) => s + c.monto, 0).toFixed(2), cuentas };
}

function bloque(nombre: string, lineas: LineaFlujoEfectivo[]): BloqueFlujoEfectivo {
  return { nombre, lineas, total: +lineas.reduce((s, l) => s + l.monto, 0).toFixed(2) };
}

// ── Prefijos del catálogo — ver PASO 0 (contabilidad.service.ts) y el
//    barrido del 2026-09-22 (todas las cuentas de activo/pasivo corriente
//    del catálogo, ver flujo-efectivo-bloques.util.spec.ts) ────────────────
const PFX_EFECTIVO                = ['1.1.1'];              // Caja + Bancos — el objetivo, nunca una línea de ajuste
const PFX_DEPRECIACION_ACUMULADA  = ['1.2.2'];               // Excluida a propósito — ver comentario de cabecera

const PFX_CLIENTES                = ['1.1.2.01'];
const PFX_OTRAS_CXC               = ['1.1.2.02', '1.1.2.03', '1.1.2.04', '1.1.2.05', '1.1.2.06', '1.1.2.07', '1.1.2.10'];
const PFX_MERCANCIAS              = ['1.1.3.01'];
const PFX_OTROS_INVENTARIOS       = ['1.1.3.02', '1.1.3.03', '1.1.3.04', '1.1.3.05', '1.1.3.06'];
const PFX_IMPUESTOS_ANTICIPADOS   = ['1.1.4'];               // ITBIS Crédito Fiscal, retenciones E41 a recuperar, anticipos ISR
const PFX_GASTOS_ANTICIPADOS      = ['1.1.6'];               // Seguros/Publicidad pagados por anticipado
const PFX_ACTIVOS_FIJOS           = ['1.2.1'];               // Propiedades, Planta y Equipo — a costo
const PFX_INVERSIONES             = ['1.1.5', '1.2.3'];      // Inversiones temporales (CP) + a largo plazo

const PFX_PROVEEDORES             = ['2.1.1.01'];
const PFX_OTRAS_CXP               = ['2.1.1.02'];            // Tarjeta de Crédito
const PFX_IMPUESTOS_POR_PAGAR     = ['2.1.2.01', '2.1.2.02']; // ITBIS + ISR por Pagar
const PFX_OTRAS_RETENCIONES       = ['2.1.2.03', '2.1.2.04', '2.1.2.05', '2.1.2.06', '2.1.2.07', '2.1.2.08', '2.1.2.09', '2.1.2.10'];
const PFX_NOMINA_CARGAS_SOCIALES  = ['2.1.3']; // Sueldos, TSS (x3), Bonificaciones, Preaviso/Cesantía, INFOTEP, Propina Legal
const PFX_OTROS_PASIVOS_CORRIENTES = ['2.1.4', '2.1.5', '2.1.6']; // Dividendos/Intereses por Pagar, Anticipos de Clientes, Gastos de Importación por Aplicar
const PFX_PRESTAMOS               = ['2.2.1'];
const PFX_CAPITAL                 = ['3.1']; // Capital Social — NUNCA 3.2 (Resultados/utilidades retenidas, ya está en Resultado Neto)

/** Todos los prefijos con línea propia (para el catch-all: lo que no esté aquí ni en las exclusiones). */
const PREFIJOS_CON_LINEA = [
  PFX_CLIENTES, PFX_OTRAS_CXC, PFX_MERCANCIAS, PFX_OTROS_INVENTARIOS,
  PFX_IMPUESTOS_ANTICIPADOS, PFX_GASTOS_ANTICIPADOS, PFX_ACTIVOS_FIJOS, PFX_INVERSIONES,
  PFX_PROVEEDORES, PFX_OTRAS_CXP, PFX_IMPUESTOS_POR_PAGAR, PFX_OTRAS_RETENCIONES,
  PFX_NOMINA_CARGAS_SOCIALES, PFX_OTROS_PASIVOS_CORRIENTES, PFX_PRESTAMOS, PFX_CAPITAL,
].flat();

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

/**
 * Catch-all — cualquier cuenta de activo/pasivo/patrimonio que NO tenga ya
 * una línea nombrada y NO esté en la lista de exclusión (efectivo,
 * depreciación acumulada). Firmada por naturaleza, igual que
 * lineaVariacion(). Ver comentario de cabecera.
 */
function lineaOtrasVariaciones(inicio: CuentaSaldoFlujo[], fin: CuentaSaldoFlujo[]): LineaFlujoEfectivo {
  const excluidos = [...PFX_EFECTIVO, ...PFX_DEPRECIACION_ACUMULADA, ...PREFIJOS_CON_LINEA];
  const esResiduo = (c: CuentaSaldoFlujo) =>
    ['activo', 'pasivo', 'patrimonio'].includes(c.tipo) && !coincidePrefijo(c.codigo, excluidos);

  const codigos = new Set([...inicio, ...fin].filter(esResiduo).map(c => c.codigo));
  const mi = porCodigo(inicio), mf = porCodigo(fin);
  const cuentas = [...codigos].sort().map(codigo => {
    const cFin = mf.get(codigo), cIni = mi.get(codigo);
    const nombreCuenta = cFin?.nombre ?? cIni?.nombre ?? codigo;
    const naturaleza   = cFin?.naturaleza ?? cIni?.naturaleza ?? 'deudora';
    const variacion    = (cFin?.saldo ?? 0) - (cIni?.saldo ?? 0);
    return { codigo, nombre: nombreCuenta, monto: +(variacion * signoPorNaturaleza(naturaleza)).toFixed(2) };
  });
  return { nombre: 'Otras variaciones de activos y pasivos', monto: +cuentas.reduce((s, c) => s + c.monto, 0).toFixed(2), cuentas };
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
    lineaVariacion('Aumento en Cuentas por Cobrar',          saldosInicio, saldosFin, PFX_CLIENTES),
    lineaVariacion('Aumento en Otras Cuentas por Cobrar',    saldosInicio, saldosFin, PFX_OTRAS_CXC),
    lineaVariacion('Aumento en Inventarios',                 saldosInicio, saldosFin, PFX_MERCANCIAS),
    lineaVariacion('Aumento en Otros Inventarios',           saldosInicio, saldosFin, PFX_OTROS_INVENTARIOS),
    lineaVariacion('Aumento en Impuestos Anticipados',       saldosInicio, saldosFin, PFX_IMPUESTOS_ANTICIPADOS),
    lineaVariacion('Aumento en Gastos Pagados por Anticipado', saldosInicio, saldosFin, PFX_GASTOS_ANTICIPADOS),
    lineaVariacion('Aumento en Cuentas por Pagar',           saldosInicio, saldosFin, PFX_PROVEEDORES),
    lineaVariacion('Aumento en Otras Cuentas por Pagar',     saldosInicio, saldosFin, PFX_OTRAS_CXP),
    lineaVariacion('Aumento en Impuestos por Pagar',         saldosInicio, saldosFin, PFX_IMPUESTOS_POR_PAGAR),
    lineaVariacion('Aumento en Otras Retenciones por Pagar', saldosInicio, saldosFin, PFX_OTRAS_RETENCIONES),
    lineaVariacion('Aumento en Nómina y Cargas Sociales por Pagar', saldosInicio, saldosFin, PFX_NOMINA_CARGAS_SOCIALES),
    lineaVariacion('Aumento en Otros Pasivos Corrientes',    saldosInicio, saldosFin, PFX_OTROS_PASIVOS_CORRIENTES),
    lineaOtrasVariaciones(saldosInicio, saldosFin),
  ]);

  const inversiones = bloque('Efectivo Neto Generado por Inversiones', [
    lineaVariacion('Aumento en Propiedades y Equipos', saldosInicio, saldosFin, PFX_ACTIVOS_FIJOS),
    lineaVariacion('Aumento en Inversiones',            saldosInicio, saldosFin, PFX_INVERSIONES),
  ]);

  const financiamientos = bloque('Flujo de Efectivo de los Financiamientos', [
    lineaVariacion('Aumento en Préstamos', saldosInicio, saldosFin, PFX_PRESTAMOS),
    lineaVariacion('Aumento en Capital',    saldosInicio, saldosFin, PFX_CAPITAL),
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
