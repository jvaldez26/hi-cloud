import { describe, it, expect, beforeEach } from 'vitest';
import {
  claveCarrito, leerCarritoGuardado, guardarCarrito, borrarCarritoYEspera,
  leerVentasEsperaGuardadas, guardarVentasEspera,
} from './carritoStorage';

beforeEach(() => localStorage.clear());

describe('carritoStorage — aislamiento por usuario', () => {
  it('el cajero B nunca lee el carrito guardado por el cajero A (misma empresa, misma sucursal)', () => {
    guardarCarrito(7, /* userId A */ 5, 1, [{ producto: 'Coca-Cola', cantidad: 2 }]);

    const { items: itemsB } = leerCarritoGuardado(7, /* userId B */ 9, 1);
    expect(itemsB).toEqual([]);

    const { items: itemsA } = leerCarritoGuardado(7, 5, 1);
    expect(itemsA).toHaveLength(1);
  });

  it('claves distintas para usuarios distintos, misma empresa/sucursal', () => {
    expect(claveCarrito(7, 5, 1)).not.toBe(claveCarrito(7, 9, 1));
  });
});

describe('carritoStorage — migración desde la clave vieja compartida', () => {
  it('migra el carrito viejo (sin usuario) a la clave nueva del usuario actual, y borra la vieja', () => {
    localStorage.setItem('pos-carrito-activo', JSON.stringify({ empresaId: 7, items: [{ producto: 'Item viejo' }] }));

    const { items, recuperado } = leerCarritoGuardado(7, 5, 1);
    expect(recuperado).toBe(true);
    expect(items).toEqual([{ producto: 'Item viejo' }]);
    expect(localStorage.getItem('pos-carrito-activo')).toBeNull();
    expect(localStorage.getItem(claveCarrito(7, 5, 1))).not.toBeNull();
  });

  it('no migra si la empresa del carrito viejo no coincide con la empresa actual', () => {
    localStorage.setItem('pos-carrito-activo', JSON.stringify({ empresaId: 99, items: [{ producto: 'De otra empresa' }] }));

    const { items, recuperado } = leerCarritoGuardado(7, 5, 1);
    expect(recuperado).toBe(false);
    expect(items).toEqual([]);
    // La clave vieja se consume igual (evita reintentar la migración fallida en cada carga).
    expect(localStorage.getItem('pos-carrito-activo')).toBeNull();
  });

  it('la migración ocurre UNA sola vez — la segunda lectura ya no encuentra nada que migrar', () => {
    localStorage.setItem('pos-carrito-activo', JSON.stringify({ empresaId: 7, items: [{ producto: 'X' }] }));
    leerCarritoGuardado(7, 5, 1); // primera lectura: migra

    localStorage.removeItem(claveCarrito(7, 5, 1)); // simula que el cajero vació el carrito después
    const { items, recuperado } = leerCarritoGuardado(7, 5, 1); // segunda lectura
    expect(recuperado).toBe(false);
    expect(items).toEqual([]);
  });

  it('formato legado aún más viejo (array plano, sin empresaId): se descarta sin migrar', () => {
    localStorage.setItem('pos-carrito-activo', JSON.stringify([{ producto: 'Muy viejo' }]));
    const { items, recuperado } = leerCarritoGuardado(7, 5, 1);
    expect(recuperado).toBe(false);
    expect(items).toEqual([]);
  });

  it('ventas en espera migran igual que el carrito, con su propia clave vieja', () => {
    localStorage.setItem('pos-ventas-espera', JSON.stringify({ empresaId: 7, items: [{ nombre: 'Venta pausada' }] }));
    const { items, recuperado } = leerVentasEsperaGuardadas(7, 5, 1);
    expect(recuperado).toBe(true);
    expect(items).toEqual([{ nombre: 'Venta pausada' }]);
  });
});

describe('carritoStorage — borrado (solo logout voluntario)', () => {
  it('borra tanto el carrito como las ventas en espera del usuario actual', () => {
    guardarCarrito(7, 5, 1, [{ a: 1 }]);
    guardarVentasEspera(7, 5, 1, [{ b: 2 }]);

    borrarCarritoYEspera(7, 5, 1);

    expect(leerCarritoGuardado(7, 5, 1).items).toEqual([]);
    expect(leerVentasEsperaGuardadas(7, 5, 1).items).toEqual([]);
  });

  it('sin empresaId o userId no borra nada (evita construir una clave con "undefined")', () => {
    guardarCarrito(7, 5, 1, [{ a: 1 }]);
    borrarCarritoYEspera(null, 5, 1);
    borrarCarritoYEspera(7, null, 1);
    expect(leerCarritoGuardado(7, 5, 1).items).toEqual([{ a: 1 }]);
  });
});
