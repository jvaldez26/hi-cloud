import { describe, it, expect } from 'vitest';
import { armarFilasER, claveDeFila, mapaMontosPorClave, filtrarFilasER } from './estadoResultadosFilas';
import { EstadoResultadosPeriodo, BloqueResultado, LineaCalculada } from '../api/reportesFinancieros.api';

function bloque(nombre: string, cuentas: { codigo: string; nombre: string; monto: number }[]): BloqueResultado {
  const total = cuentas.reduce((s, c) => s + c.monto, 0);
  return {
    nombre, total, porcentajeIngresos: 0,
    cuentas: cuentas.map(c => ({ ...c, porcentajeIngresos: 0 })),
  };
}

function linea(nombre: string, monto: number, esCalculada = true): LineaCalculada {
  return { nombre, monto, porcentajeIngresos: 0, porcentajeMargen: esCalculada ? 0 : null };
}

function periodoFixture(): EstadoResultadosPeriodo {
  return {
    ingresos: bloque('Ingresos', [{ codigo: '4.1.1.01', nombre: 'Ventas', monto: 10000 }]),
    costoDeVentas: bloque('Costo de Ventas', [{ codigo: '5.1.1.01', nombre: 'Costo', monto: 4000 }]),
    utilidadBruta: linea('Utilidad Bruta', 6000),
    gastos: bloque('Gastos', [{ codigo: '6.1.2.01', nombre: 'Alquiler', monto: 1000 }]),
    resultadoOperacional: linea('Resultado Operacional', 5000),
    otrosIngresos: bloque('Otros Ingresos', []),
    otrosGastos: bloque('Otros Gastos', []),
    gananciaPerdidaDelPeriodo: linea('Ganancia (Pérdida) del Período', 5000),
  };
}

describe('armarFilasER', () => {
  it('bloque cerrado: solo la fila header (que ya trae el total)', () => {
    const filas = armarFilasER(periodoFixture(), new Set());
    const filasIngresos = filas.filter(f => f.bloque === 'Ingresos');
    expect(filasIngresos).toHaveLength(1);
    expect(filasIngresos[0].tipo).toBe('header');
    expect(filasIngresos[0].monto).toBe(10000);
  });

  it('bloque abierto: header + cuentas + total, en ese orden', () => {
    const filas = armarFilasER(periodoFixture(), new Set(['Ingresos']));
    const filasIngresos = filas.filter(f => f.bloque === 'Ingresos');
    expect(filasIngresos.map(f => f.tipo)).toEqual(['header', 'cuenta', 'total']);
    expect(filasIngresos[1].codigo).toBe('4.1.1.01');
    expect(filasIngresos[2].monto).toBe(10000);
  });

  it('respeta el orden completo de la estructura pedida', () => {
    const filas = armarFilasER(periodoFixture(), new Set());
    expect(filas.map(f => f.nombre)).toEqual([
      'Ingresos', 'Costo de Ventas', 'Utilidad Bruta', 'Gastos', 'Resultado Operacional',
      'Otros Ingresos', 'Otros Gastos', 'Ganancia (Pérdida) del Período',
    ]);
  });

  it('un bloque vacío (Otros Ingresos) igual aparece como header con total 0', () => {
    const filas = armarFilasER(periodoFixture(), new Set());
    const otrosIngresos = filas.find(f => f.bloque === 'Otros Ingresos');
    expect(otrosIngresos?.monto).toBe(0);
  });
});

describe('claveDeFila / mapaMontosPorClave — comparación entre dos períodos', () => {
  it('la clave de una cuenta y la de su total de bloque leen el monto correcto del otro período', () => {
    const actual = periodoFixture();
    const anterior = periodoFixture();
    anterior.ingresos = bloque('Ingresos', [{ codigo: '4.1.1.01', nombre: 'Ventas', monto: 7000 }]);

    const filas = armarFilasER(actual, new Set(['Ingresos']));
    const mapaAnterior = mapaMontosPorClave(anterior);

    const filaCuenta = filas.find(f => f.tipo === 'cuenta')!;
    expect(mapaAnterior.get(claveDeFila(filaCuenta))).toBe(7000);

    const filaTotal = filas.find(f => f.tipo === 'total')!;
    expect(mapaAnterior.get(claveDeFila(filaTotal))).toBe(7000);
  });

  it('una cuenta que no existe en el otro período no está en su mapa (el caller decide el default, normalmente 0)', () => {
    const actual = periodoFixture();
    const anterior = periodoFixture();
    anterior.ingresos = bloque('Ingresos', []); // sin movimiento en el período anterior

    const filas = armarFilasER(actual, new Set(['Ingresos']));
    const mapaAnterior = mapaMontosPorClave(anterior);
    const filaCuenta = filas.find(f => f.tipo === 'cuenta')!;
    expect(mapaAnterior.has(claveDeFila(filaCuenta))).toBe(false);
  });

  it('la clave de una línea calculada lee el monto de la misma línea en el otro período', () => {
    const actual = periodoFixture();
    const anterior = periodoFixture();
    anterior.gananciaPerdidaDelPeriodo = linea('Ganancia (Pérdida) del Período', -2000);

    const filas = armarFilasER(actual, new Set());
    const filaCalc = filas.find(f => f.tipo === 'calculada' && f.nombre === 'Ganancia (Pérdida) del Período')!;
    expect(mapaMontosPorClave(anterior).get(claveDeFila(filaCalc))).toBe(-2000);
  });
});

describe('filtrarFilasER', () => {
  // El buscador siempre opera sobre la lista completa (todos los bloques
  // abiertos) — así una cuenta aparece en el resultado de búsqueda aunque su
  // bloque esté colapsado en la vista actual; el componente decide con qué
  // conjunto llamar a armarFilasER() según haya o no término de búsqueda.
  const TODOS = new Set(['Ingresos', 'Costo de Ventas', 'Gastos', 'Otros Ingresos', 'Otros Gastos']);

  it('sin término: devuelve todas las filas intactas', () => {
    const filas = armarFilasER(periodoFixture(), new Set(['Ingresos']));
    expect(filtrarFilasER(filas, '')).toEqual(filas);
  });

  it('busca por código o nombre de cuenta y mantiene el bloque (header + esa cuenta + total)', () => {
    const filas = armarFilasER(periodoFixture(), TODOS);
    const filtradas = filtrarFilasER(filas, '4.1.1.01');
    expect(filtradas.map(f => f.tipo)).toEqual(['header', 'cuenta', 'total']);
    expect(filtradas[1].nombre).toBe('Ventas');
  });

  it('un bloque sin ninguna coincidencia desaparece por completo', () => {
    const filas = armarFilasER(periodoFixture(), TODOS);
    const filtradas = filtrarFilasER(filas, '4.1.1.01');
    expect(filtradas.some(f => f.bloque === 'Gastos')).toBe(false);
    expect(filtradas.some(f => f.bloque === 'Costo de Ventas')).toBe(false);
  });

  it('una línea calculada que coincide por nombre sobrevive sola', () => {
    const filas = armarFilasER(periodoFixture(), TODOS);
    const filtradas = filtrarFilasER(filas, 'utilidad bruta');
    expect(filtradas).toHaveLength(1);
    expect(filtradas[0].tipo).toBe('calculada');
  });
});
