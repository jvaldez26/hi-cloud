/**
 * Estado de Resultados v2 (2026-09-21) — construcción de los bloques
 * (Ingresos, Costo de Ventas, Gastos, Otros Ingresos, Otros Gastos) y las
 * líneas calculadas (Utilidad Bruta, Resultado Operacional, Ganancia
 * (Pérdida) del Período) a partir de los saldos por cuenta
 * (SaldosCuentasService, única fuente de verdad) y la clasificación
 * operacional/no operacional resuelta con herencia
 * (clasificacion-resultado.util.ts).
 *
 * Los bloques se arman por CLASIFICACIÓN de la cuenta (tipo +
 * clasificacionResultado efectiva), nunca por rango de código — a
 * diferencia de Balance General, aquí NO hay árbol: cada bloque es una
 * lista PLANA de las cuentas con movimiento de ese bloque (SaldosCuentasService
 * ya solo devuelve cuentas con saldo ≠ 0 en el rango — no hace falta
 * sintetizar totales de cuentas de agrupación como en Balance General).
 *
 * Funciones PURAS — sin DB, para poder probar los casos límite (ingresos en
 * 0, pérdida, cuenta huérfana) sin Postgres.
 */

import { ClasificacionResultado, resolverClasificacionResultado, CuentaClasificable } from './clasificacion-resultado.util';

export interface CuentaSaldo {
  codigo: string;
  nombre: string;
  tipo: string; // 'ingreso' | 'costo' | 'gasto' (y otros, ignorados aquí)
  saldo: number;
}

export interface LineaCuentaResultado {
  codigo: string;
  nombre: string;
  monto: number;
  porcentajeIngresos: number; // 0 si Total Ingresos es 0 — nunca NaN/Infinity
}

export interface BloqueResultado {
  nombre: string;
  cuentas: LineaCuentaResultado[];
  total: number;
  porcentajeIngresos: number;
}

export interface LineaCalculada {
  nombre: string;
  monto: number;
  porcentajeIngresos: number;
  porcentajeMargen: number | null; // solo las 3 líneas de resultado — null en el resto
}

export interface EstadoResultadosPeriodo {
  ingresos:               BloqueResultado;
  costoDeVentas:          BloqueResultado;
  utilidadBruta:          LineaCalculada;
  gastos:                 BloqueResultado;
  resultadoOperacional:   LineaCalculada;
  otrosIngresos:          BloqueResultado;
  otrosGastos:            BloqueResultado;
  gananciaPerdidaDelPeriodo: LineaCalculada;
}

function pct(monto: number, base: number): number {
  return base !== 0 ? +((monto / base) * 100).toFixed(1) : 0;
}

/** Filtra por tipo + clasificación efectiva, ordena por código, arma el bloque. Cuentas en 0 se pueden excluir con ocultarCeros. */
function construirBloque(
  nombre: string,
  saldos: CuentaSaldo[],
  tipo: string,
  clasificacion: Map<string, ClasificacionResultado> | null, // null = no filtra por clasificación (Costo de Ventas: TODO el tipo costo)
  clasificacionEsperada: ClasificacionResultado | null,
  totalIngresos: number,
  ocultarCeros: boolean,
): BloqueResultado {
  const cuentas = saldos
    .filter(c => c.tipo === tipo)
    .filter(c => !clasificacion || (clasificacion.get(c.codigo) ?? 'operacional') === clasificacionEsperada)
    .filter(c => !ocultarCeros || c.saldo !== 0)
    .sort((a, b) => a.codigo.localeCompare(b.codigo))
    .map(c => ({
      codigo: c.codigo, nombre: c.nombre, monto: c.saldo,
      porcentajeIngresos: pct(c.saldo, totalIngresos),
    }));

  const total = +cuentas.reduce((s, c) => s + c.monto, 0).toFixed(2);
  return { nombre, cuentas, total, porcentajeIngresos: pct(total, totalIngresos) };
}

function lineaCalculada(nombre: string, monto: number, totalIngresos: number, esLineaResultado: boolean): LineaCalculada {
  return {
    nombre, monto: +monto.toFixed(2),
    porcentajeIngresos: pct(monto, totalIngresos),
    porcentajeMargen: esLineaResultado ? pct(monto, totalIngresos) : null,
  };
}

/**
 * Arma el Estado de Resultados completo de un período a partir de sus
 * saldos ya calculados (SaldosCuentasService.obtenerSaldos(empresaId,
 * desde, hasta)) y el catálogo completo (para resolver clasificacionResultado
 * con herencia — un catálogo vacío/parcial nunca rompe: toda cuenta sin
 * clasificación cae a 'operacional', el default).
 */
export function construirEstadoResultados(
  saldos: CuentaSaldo[],
  catalogo: CuentaClasificable[],
  ocultarCeros: boolean,
): EstadoResultadosPeriodo {
  const clasificacionPorCodigo = resolverClasificacionResultado(catalogo);

  const totalIngresosOperacionales = +saldos
    .filter(c => c.tipo === 'ingreso' && (clasificacionPorCodigo.get(c.codigo) ?? 'operacional') === 'operacional')
    .reduce((s, c) => s + c.saldo, 0).toFixed(2);

  const ingresos      = construirBloque('Ingresos', saldos, 'ingreso', clasificacionPorCodigo, 'operacional', totalIngresosOperacionales, ocultarCeros);
  const costoDeVentas = construirBloque('Costo de Ventas', saldos, 'costo', null, null, totalIngresosOperacionales, ocultarCeros);
  const utilidadBruta = lineaCalculada('Utilidad Bruta', ingresos.total - costoDeVentas.total, totalIngresosOperacionales, true);

  const gastos = construirBloque('Gastos', saldos, 'gasto', clasificacionPorCodigo, 'operacional', totalIngresosOperacionales, ocultarCeros);
  const resultadoOperacional = lineaCalculada('Resultado Operacional', utilidadBruta.monto - gastos.total, totalIngresosOperacionales, true);

  const otrosIngresos = construirBloque('Otros Ingresos', saldos, 'ingreso', clasificacionPorCodigo, 'no_operacional', totalIngresosOperacionales, ocultarCeros);
  const otrosGastos   = construirBloque('Otros Gastos', saldos, 'gasto', clasificacionPorCodigo, 'no_operacional', totalIngresosOperacionales, ocultarCeros);
  const gananciaPerdidaDelPeriodo = lineaCalculada(
    'Ganancia (Pérdida) del Período',
    resultadoOperacional.monto + otrosIngresos.total - otrosGastos.total,
    totalIngresosOperacionales, true,
  );

  return {
    ingresos, costoDeVentas, utilidadBruta, gastos, resultadoOperacional,
    otrosIngresos, otrosGastos, gananciaPerdidaDelPeriodo,
  };
}

// ─── Aplanado para exportación (Excel/CSV/PDF) ─────────────────────────────

export interface FilaEstadoResultados {
  bloque:              string;
  codigo:              string;
  nombre:              string;
  monto:               number;
  porcentajeIngresos:  number;
  porcentajeMargen:    number | null;
  esTotal:             boolean; // fila "Total <bloque>" — fondo + línea superior
  esLineaCalculada:    boolean; // Utilidad Bruta / Resultado Operacional / Ganancia (Pérdida) — mismo estilo, más énfasis
}

function filasBloque(bloque: BloqueResultado): FilaEstadoResultados[] {
  const filas: FilaEstadoResultados[] = bloque.cuentas.map(c => ({
    bloque: bloque.nombre, codigo: c.codigo, nombre: c.nombre, monto: c.monto,
    porcentajeIngresos: c.porcentajeIngresos, porcentajeMargen: null,
    esTotal: false, esLineaCalculada: false,
  }));
  filas.push({
    bloque: bloque.nombre, codigo: '', nombre: `Total ${bloque.nombre}`, monto: bloque.total,
    porcentajeIngresos: bloque.porcentajeIngresos, porcentajeMargen: null,
    esTotal: true, esLineaCalculada: false,
  });
  return filas;
}

function filaCalculada(linea: LineaCalculada): FilaEstadoResultados {
  return {
    bloque: '', codigo: '', nombre: linea.nombre.toUpperCase(), monto: linea.monto,
    porcentajeIngresos: linea.porcentajeIngresos, porcentajeMargen: linea.porcentajeMargen,
    esTotal: true, esLineaCalculada: true,
  };
}

/** Orden EXACTO de la estructura pedida — Ingresos → Costo de Ventas → Utilidad Bruta → Gastos → Resultado Operacional → Otros Ingresos → Otros Gastos → Ganancia (Pérdida) del Período. */
export function aplanarEstadoResultados(periodo: EstadoResultadosPeriodo): FilaEstadoResultados[] {
  return [
    ...filasBloque(periodo.ingresos),
    ...filasBloque(periodo.costoDeVentas),
    filaCalculada(periodo.utilidadBruta),
    ...filasBloque(periodo.gastos),
    filaCalculada(periodo.resultadoOperacional),
    ...filasBloque(periodo.otrosIngresos),
    ...filasBloque(periodo.otrosGastos),
    filaCalculada(periodo.gananciaPerdidaDelPeriodo),
  ];
}
