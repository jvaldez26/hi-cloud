import { describe, it, expect } from 'vitest';
import {
  calcularTotalesCarritoPOS,
  type ItemCarritoPOS,
  type OpcionesCarritoPOS,
} from './totalesCarritoPOS';
import { descuentoFinalABase, descuentoBaseAFinal, pctIvaEfectivo, round4 } from './descuentoItbis';

/**
 * El util sale de POSPage.tsx, donde este cálculo decidía —y decide— lo que
 * cobra la caja. La extracción no puede mover un céntimo, así que no se
 * comprueba "que esté bien": se comprueba que da EXACTAMENTE lo mismo que el
 * bloque que había, copiado literalmente aquí abajo.
 *
 * Y hay un riesgo propio de este refactor que ningún typecheck ve: las catorce
 * variables son números, así que cruzar dos nombres al reconectar el componente
 * compila igual y cambia lo que se cobra sin ningún síntoma. Contra eso está el
 * "canario": un carrito donde los catorce valores salen DISTINTOS dos a dos, de
 * forma que cualquier permutación cambia al menos uno y la comparación la caza.
 */

// ─────────────────────────────────────────────────────────────────────────────
// COPIA LITERAL del bloque de POSPage.tsx (líneas 9880-9936 en 31c7d162).
// No editar para "arreglar" un fallo: si esto y el util divergen, el que está
// mal es el util.
// ─────────────────────────────────────────────────────────────────────────────
function bloqueOriginalPOS(cart: any[], o: OpcionesCarritoPOS) {
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const { descGlobal, descGlobalTipo, precioIncluyeItbis, tipoNcf } = o;

  const lineasBase = cart.map(i => {
    const pct      = Number((i.produto as any).porcentajeIva ?? 0) / 100;
    const lineaRaw = (i.precio - i.descuentoMonto) * i.cantidad;
    const baseRaw  = precioIncluyeItbis && pct > 0 ? lineaRaw / (1 + pct) : lineaRaw;
    return { pct, baseRaw, subtotal: round2(baseRaw) };
  });
  const subtotal = round2(lineasBase.reduce((s, l) => s + l.subtotal, 0));
  const iva      = round2(lineasBase.reduce((s, l) => s + round2(l.baseRaw * l.pct), 0));
  const descGlobalVal   = Math.max(0, parseFloat(descGlobal) || 0);
  const pctIvaCarrito   = tipoNcf === 'E44' ? 0 : pctIvaEfectivo(subtotal, iva);
  const totalConItbis   = tipoNcf === 'E44' ? subtotal : round2(subtotal + iva);
  const descGlobalMonto = round4(descGlobalTipo === 'pct'
    ? subtotal * Math.min(descGlobalVal, 100) / 100
    : Math.min(
        descuentoFinalABase(Math.min(descGlobalVal, totalConItbis), pctIvaCarrito, precioIncluyeItbis),
        subtotal,
      ));
  const descGlobalFinal = descGlobalTipo === 'fijo'
    ? round2(Math.min(descGlobalVal, totalConItbis))
    : descuentoBaseAFinal(descGlobalMonto, pctIvaCarrito, precioIncluyeItbis);
  const lineasConDesc = lineasBase.map(l => {
    const descProp    = subtotal > 0 ? round2((l.subtotal / subtotal) * descGlobalMonto) : 0;
    const subtotFinal = round2(l.subtotal - descProp);
    const rawFinal    = l.subtotal > 0 ? l.baseRaw * (subtotFinal / l.subtotal) : subtotFinal;
    return { subtotFinal, ivaLinea: round2(rawFinal * l.pct) };
  });
  const subtotalConDesc = round2(lineasConDesc.reduce((s, l) => s + l.subtotFinal, 0));
  const ivaConDesc      = round2(lineasConDesc.reduce((s, l) => s + l.ivaLinea,    0));
  const total           = round2(subtotalConDesc + ivaConDesc);
  const ivaEfectivo   = tipoNcf === 'E44' ? 0 : ivaConDesc;
  const totalEfectivo = tipoNcf === 'E44' ? subtotalConDesc : total;

  return {
    lineasBase, subtotal, iva, descGlobalVal, pctIvaCarrito, totalConItbis,
    descGlobalMonto, descGlobalFinal, lineasConDesc, subtotalConDesc,
    ivaConDesc, total, ivaEfectivo, totalEfectivo,
  };
}

/** Los catorce nombres, escritos a mano. Si el util añade o quita uno, falla. */
const CLAVES = [
  'lineasBase', 'subtotal', 'iva', 'descGlobalVal', 'pctIvaCarrito',
  'totalConItbis', 'descGlobalMonto', 'descGlobalFinal', 'lineasConDesc',
  'subtotalConDesc', 'ivaConDesc', 'total', 'ivaEfectivo', 'totalEfectivo',
] as const;

/** Los ocho escalares que el componente usa FUERA del bloque */
const ESCALARES_EXPUESTOS = [
  'subtotal', 'iva', 'descGlobalMonto', 'descGlobalFinal',
  'ivaConDesc', 'total', 'ivaEfectivo', 'totalEfectivo',
] as const;

const item = (precio: number, iva: number, cantidad: number, desc = 0): ItemCarritoPOS => ({
  precio, cantidad, descuentoMonto: desc, produto: { porcentajeIva: iva },
});

const opts = (o: Partial<OpcionesCarritoPOS> = {}): OpcionesCarritoPOS => ({
  descGlobal: '0', descGlobalTipo: 'fijo', precioIncluyeItbis: false, tipoNcf: 'E32', ...o,
});

function prng(semilla: number) {
  let s = semilla >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0x100000000; };
}

/** Compara las catorce, una por una y por su nombre */
function compararTodo(a: any, b: any) {
  expect(a.lineasBase).toEqual(b.lineasBase);
  expect(a.subtotal).toBe(b.subtotal);
  expect(a.iva).toBe(b.iva);
  expect(a.descGlobalVal).toBe(b.descGlobalVal);
  expect(a.pctIvaCarrito).toBe(b.pctIvaCarrito);
  expect(a.totalConItbis).toBe(b.totalConItbis);
  expect(a.descGlobalMonto).toBe(b.descGlobalMonto);
  expect(a.descGlobalFinal).toBe(b.descGlobalFinal);
  expect(a.lineasConDesc).toEqual(b.lineasConDesc);
  expect(a.subtotalConDesc).toBe(b.subtotalConDesc);
  expect(a.ivaConDesc).toBe(b.ivaConDesc);
  expect(a.total).toBe(b.total);
  expect(a.ivaEfectivo).toBe(b.ivaEfectivo);
  expect(a.totalEfectivo).toBe(b.totalEfectivo);
}

// ─────────────────────────────────────────────────────────────────────────────

describe('el util devuelve exactamente las catorce del bloque original', () => {
  it('ni una más ni una menos', () => {
    const r = calcularTotalesCarritoPOS([item(100, 18, 1)], opts());
    expect(Object.keys(r).sort()).toEqual([...CLAVES].sort());
  });
});

describe('canario — valores distintos dos a dos, para cazar un nombre cruzado', () => {
  /**
   * Al reconectar POSPage hay catorce variables, todas números: cruzar dos
   * nombres compila igual y cambia lo que se cobra sin ningún síntoma. Este
   * carrito está elegido para que los valores salgan DISTINTOS entre sí, de
   * forma que cualquier permutación mueve al menos uno.
   *
   * Con E32 no se puede pedir a los ocho: `ivaEfectivo` e `ivaConDesc` son el
   * MISMO número por construcción —igual que `totalEfectivo` y `total`—, porque
   * el ternario solo los separa en Zona Franca:
   *
   *     const ivaEfectivo   = tipoNcf === 'E44' ? 0 : ivaConDesc;
   *     const totalEfectivo = tipoNcf === 'E44' ? subtotalConDesc : total;
   *
   * Así que el canario que de verdad discrimina los ocho es el de E44, y es el
   * que hay que mirar si algún día falla el refactor. El de E32 comprueba los
   * seis que sí son independientes ahí, y deja por escrito qué dos pares son
   * alias — cruzarlos en E32 es inocuo, en E44 no.
   */
  const CARRITO = [item(1234.56, 18, 3, 100), item(789.01, 16, 2), item(456.78, 0, 5)];

  const E32 = opts({ descGlobal: '337', descGlobalTipo: 'fijo' });
  const E44 = opts({ descGlobal: '337', descGlobalTipo: 'fijo', tipoNcf: 'E44' });

  /**
   * Ningún escenario aislado da los ocho distintos, porque hay alias
   * ESTRUCTURALES que dependen del tipo de comprobante:
   *
   *   en E32   ivaEfectivo ≡ ivaConDesc   y   totalEfectivo ≡ total
   *   en E44   descGlobalMonto ≡ descGlobalFinal  (la tasa efectiva es 0)
   *
   * Pero cada par se separa en UNO de los dos. Así que la garantía se afirma
   * sobre la unión: para los 28 pares posibles, hay al menos un escenario donde
   * los dos valores difieren. Con eso, cruzar cualquier par al reconectar
   * POSPage cambia algún número y el diferencial lo caza.
   */
  it('cada par de los ocho se distingue en E32 o en E44', () => {
    const r32 = calcularTotalesCarritoPOS(CARRITO, E32) as any;
    const r44 = calcularTotalesCarritoPOS(CARRITO, E44) as any;

    const indistinguibles: string[] = [];
    for (let i = 0; i < ESCALARES_EXPUESTOS.length; i++) {
      for (let j = i + 1; j < ESCALARES_EXPUESTOS.length; j++) {
        const a = ESCALARES_EXPUESTOS[i], b = ESCALARES_EXPUESTOS[j];
        const seSeparaEn32 = r32[a] !== r32[b];
        const seSeparaEn44 = r44[a] !== r44[b];
        if (!seSeparaEn32 && !seSeparaEn44) indistinguibles.push(`${a} ↔ ${b}`);
      }
    }
    expect(indistinguibles).toEqual([]);
  });

  it('y en los dos escenarios coincide con el bloque original, uno por uno', () => {
    compararTodo(calcularTotalesCarritoPOS(CARRITO, E32), bloqueOriginalPOS(CARRITO, E32));
    compararTodo(calcularTotalesCarritoPOS(CARRITO, E44), bloqueOriginalPOS(CARRITO, E44));
  });

  it('deja por escrito qué pares son alias en cada escenario', () => {
    const r32 = calcularTotalesCarritoPOS(CARRITO, E32);
    const r44 = calcularTotalesCarritoPOS(CARRITO, E44);
    // Fuera de Zona Franca estos dos ternarios no separan nada
    expect(r32.ivaEfectivo).toBe(r32.ivaConDesc);
    expect(r32.totalEfectivo).toBe(r32.total);
    // Y en Zona Franca la tasa efectiva es 0, así que el descuento no se convierte
    expect(r44.descGlobalFinal).toBe(r44.descGlobalMonto);
    expect(r44.ivaEfectivo).toBe(0);
  });

  it('deja los valores por escrito, para cotejarlos a ojo al reconectar', () => {
    const o = opts({ descGlobal: '337', descGlobalTipo: 'fijo', tipoNcf: 'E44' });
    const r = calcularTotalesCarritoPOS(CARRITO, o);
    expect({
      subtotal: r.subtotal, iva: r.iva, descGlobalMonto: r.descGlobalMonto,
      descGlobalFinal: r.descGlobalFinal, ivaConDesc: r.ivaConDesc,
      total: r.total, ivaEfectivo: r.ivaEfectivo, totalEfectivo: r.totalEfectivo,
    }).toMatchSnapshot();
  });
});

describe('casos con nombre', () => {
  it('carrito vacío no divide entre cero', () => {
    const r = calcularTotalesCarritoPOS([], opts());
    expect(r.total).toBe(0);
    expect(r.pctIvaCarrito).toBe(0);
    compararTodo(r, bloqueOriginalPOS([], opts()));
  });

  it('descuento global fijo: el total baja EXACTAMENTE lo tecleado', () => {
    const cart = [item(1000, 18, 2)];
    const sin  = calcularTotalesCarritoPOS(cart, opts());
    const con  = calcularTotalesCarritoPOS(cart, opts({ descGlobal: '500' }));
    expect(round2v(sin.totalEfectivo - con.totalEfectivo)).toBe(500);
  });

  it('descuento global en %: el total baja ese mismo %', () => {
    const cart = [item(1000, 18, 2)];
    const sin  = calcularTotalesCarritoPOS(cart, opts());
    const con  = calcularTotalesCarritoPOS(cart, opts({ descGlobal: '10', descGlobalTipo: 'pct' }));
    expect(round2v(sin.totalEfectivo * 0.9)).toBe(round2v(con.totalEfectivo));
  });

  it('el descuento global no puede pasarse del total cobrable', () => {
    const r = calcularTotalesCarritoPOS([item(100, 18, 1)], opts({ descGlobal: '99999' }));
    expect(r.totalEfectivo).toBe(0);
    expect(r.descGlobalMonto).toBe(100);
  });

  it('E44 (Zona Franca): sin ITBIS y el total es el subtotal', () => {
    const r = calcularTotalesCarritoPOS([item(1000, 18, 2)], opts({ tipoNcf: 'E44' }));
    expect(r.ivaEfectivo).toBe(0);
    expect(r.totalEfectivo).toBe(r.subtotalConDesc);
    expect(r.pctIvaCarrito).toBe(0);
  });

  it('con precioIncluyeItbis el precio se desglosa en vez de sumarle ITBIS', () => {
    // Hoy el POS lo fuerza a false; el parámetro existe para el día que se
    // reactive, así que se cubre igual.
    const r = calcularTotalesCarritoPOS([item(118, 18, 1)], opts({ precioIncluyeItbis: true }));
    expect(r.subtotal).toBe(100);
    expect(r.iva).toBe(18);
    expect(r.totalEfectivo).toBe(118);
  });
});

function round2v(n: number) { return Math.round(n * 100) / 100; }

describe('diferencial contra el bloque original', () => {
  it('5000 carritos generados dan las catorce idénticas', () => {
    const rnd = prng(20260902);
    let conDescItem = 0, conGlobalFijo = 0, conGlobalPct = 0, e44 = 0, incluyeItbis = 0, multiTasa = 0;

    for (let k = 0; k < 5000; k++) {
      const n = 1 + Math.floor(rnd() * 5);
      const cart: ItemCarritoPOS[] = [];
      for (let j = 0; j < n; j++) {
        const iva    = [0, 16, 18][Math.floor(rnd() * 3)];
        const precio = parseFloat((rnd() * 3000 + 1).toFixed(2));
        // Cantidades fraccionarias incluidas: producción las tiene (0.86, 6.21)
        const cant   = rnd() < 0.25 ? parseFloat((rnd() * 8 + 0.05).toFixed(4)) : 1 + Math.floor(rnd() * 10);
        const desc   = rnd() < 0.4 ? parseFloat((precio * rnd() * 0.5).toFixed(4)) : 0;
        cart.push(item(precio, iva, cant, desc));
      }
      const g = rnd();
      const o = opts({
        descGlobal: g < 0.35 ? '0' : g < 0.7 ? String((rnd() * 2000).toFixed(2)) : String((rnd() * 40).toFixed(2)),
        descGlobalTipo: g >= 0.7 ? 'pct' : 'fijo',
        precioIncluyeItbis: rnd() < 0.15,
        tipoNcf: rnd() < 0.1 ? 'E44' : 'E32',
      });

      compararTodo(calcularTotalesCarritoPOS(cart, o), bloqueOriginalPOS(cart, o));

      if (cart.some(i => i.descuentoMonto > 0)) conDescItem++;
      if (o.descGlobalTipo === 'fijo' && o.descGlobal !== '0') conGlobalFijo++;
      if (o.descGlobalTipo === 'pct') conGlobalPct++;
      if (o.tipoNcf === 'E44') e44++;
      if (o.precioIncluyeItbis) incluyeItbis++;
      if (new Set(cart.map(i => i.produto.porcentajeIva)).size > 1) multiTasa++;
    }

    // Que la corrida haya ejercitado de verdad cada camino
    expect(conDescItem).toBeGreaterThan(1000);
    expect(conGlobalFijo).toBeGreaterThan(500);
    expect(conGlobalPct).toBeGreaterThan(500);
    expect(e44).toBeGreaterThan(200);
    expect(incluyeItbis).toBeGreaterThan(300);
    expect(multiTasa).toBeGreaterThan(1000);
  });
});
