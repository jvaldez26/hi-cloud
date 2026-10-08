import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  claveCarrito, leerCarritoGuardado, guardarCarrito, borrarCarritoYEspera,
  leerVentasEsperaGuardadas, guardarVentasEspera, idDePestana,
  listarCarritosDeOtrasPestanas, borrarCarritoDePestana,
} from './carritoStorage';

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe('carritoStorage — aislamiento por usuario', () => {
  it('el cajero B nunca lee el carrito guardado por el cajero A (misma empresa, misma sucursal)', () => {
    guardarCarrito(7, /* userId A */ 5, 1, 'tabA', [{ producto: 'Coca-Cola', cantidad: 2 }]);

    const { items: itemsB } = leerCarritoGuardado(7, /* userId B */ 9, 1, 'tabB');
    expect(itemsB).toEqual([]);

    const { items: itemsA } = leerCarritoGuardado(7, 5, 1, 'tabA');
    expect(itemsA).toHaveLength(1);
  });

  it('claves distintas para usuarios distintos, misma empresa/sucursal/pestaña', () => {
    expect(claveCarrito(7, 5, 1, 'tabA')).not.toBe(claveCarrito(7, 9, 1, 'tabA'));
  });
});

describe('carritoStorage — aislamiento por pestaña (decisión 2026-10-08)', () => {
  it('dos pestañas del mismo cajero tienen carritos distintos — ninguna ve el de la otra', () => {
    guardarCarrito(7, 5, 1, 'tab-1', [{ producto: 'Producto en pestaña 1' }]);
    guardarCarrito(7, 5, 1, 'tab-2', [{ producto: 'Producto en pestaña 2' }]);

    expect(leerCarritoGuardado(7, 5, 1, 'tab-1').items).toEqual([{ producto: 'Producto en pestaña 1' }]);
    expect(leerCarritoGuardado(7, 5, 1, 'tab-2').items).toEqual([{ producto: 'Producto en pestaña 2' }]);
  });

  it('recargar una pestaña recupera SU PROPIO carrito, no el de otra pestaña abierta', () => {
    guardarCarrito(7, 5, 1, 'tab-1', [{ producto: 'De la pestaña 1' }]);
    guardarCarrito(7, 5, 1, 'tab-2', [{ producto: 'De la pestaña 2' }]);

    // "Recargar tab-1" = volver a leer con el mismo tabId (simula F5: el
    // id sigue en sessionStorage de esa pestaña, el carrito sigue en localStorage).
    const { items, recuperado } = leerCarritoGuardado(7, 5, 1, 'tab-1');
    expect(recuperado).toBe(true);
    expect(items).toEqual([{ producto: 'De la pestaña 1' }]);
  });

  it('una pestaña nueva (tabId nunca visto) nunca hereda el carrito de otra pestaña abierta', () => {
    guardarCarrito(7, 5, 1, 'tab-vieja', [{ producto: 'De la pestaña vieja' }]);

    const { items, recuperado } = leerCarritoGuardado(7, 5, 1, 'tab-nueva');
    expect(recuperado).toBe(false);
    expect(items).toEqual([]);
  });

  it('idDePestana() es estable entre llamadas (simula sobrevivir a un F5 de la misma pestaña)', () => {
    const id1 = idDePestana();
    const id2 = idDePestana();
    expect(id1).toBe(id2);
  });

  it('idDePestana() genera un id distinto si sessionStorage está vacío (simula una pestaña nueva)', () => {
    const id1 = idDePestana();
    sessionStorage.clear(); // una pestaña nueva nunca comparte sessionStorage con esta
    const id2 = idDePestana();
    expect(id2).not.toBe(id1);
  });
});

describe('carritoStorage — carritos huérfanos de otras pestañas', () => {
  it('lista el carrito de otra pestaña, excluyendo el propio', () => {
    guardarCarrito(7, 5, 1, 'tab-propia', [{ producto: 'Mío' }]);
    guardarCarrito(7, 5, 1, 'tab-huerfana', [{ producto: 'Huérfano' }]);

    const huerfanos = listarCarritosDeOtrasPestanas(7, 5, 1, 'tab-propia');
    expect(huerfanos).toEqual([{ tabId: 'tab-huerfana', items: [{ producto: 'Huérfano' }] }]);
  });

  it('no lista carritos vacíos de otras pestañas (nada que recuperar)', () => {
    guardarCarrito(7, 5, 1, 'tab-propia', []);
    guardarCarrito(7, 5, 1, 'tab-vacia', []);

    expect(listarCarritosDeOtrasPestanas(7, 5, 1, 'tab-propia')).toEqual([]);
  });

  it('no mezcla carritos de otro usuario o de otra sucursal', () => {
    guardarCarrito(7, 9, 1, 'tab-otro-usuario', [{ producto: 'De otro cajero' }]);
    guardarCarrito(7, 5, 2, 'tab-otra-sucursal', [{ producto: 'De otra sucursal' }]);

    expect(listarCarritosDeOtrasPestanas(7, 5, 1, 'tab-propia')).toEqual([]);
  });

  it('borrarCarritoDePestana limpia el carrito de la pestaña indicada, no el propio', () => {
    guardarCarrito(7, 5, 1, 'tab-propia', [{ producto: 'Mío' }]);
    guardarCarrito(7, 5, 1, 'tab-huerfana', [{ producto: 'Huérfano' }]);

    borrarCarritoDePestana(7, 5, 1, 'tab-huerfana');

    expect(leerCarritoGuardado(7, 5, 1, 'tab-huerfana').items).toEqual([]);
    expect(leerCarritoGuardado(7, 5, 1, 'tab-propia').items).toEqual([{ producto: 'Mío' }]);
  });
});

describe('carritoStorage — migración desde claves viejas (antes de 2026-10-08)', () => {
  it('migra el carrito per-usuario sin pestaña (clave de antes de hoy) a la clave nueva por pestaña, y la borra', () => {
    localStorage.setItem('pos-carrito-activo:7:5:1', JSON.stringify({ empresaId: 7, items: [{ producto: 'Item sin pestaña' }] }));

    const { items, recuperado } = leerCarritoGuardado(7, 5, 1, 'tab-1');
    expect(recuperado).toBe(true);
    expect(items).toEqual([{ producto: 'Item sin pestaña' }]);
    expect(localStorage.getItem('pos-carrito-activo:7:5:1')).toBeNull();
    expect(localStorage.getItem(claveCarrito(7, 5, 1, 'tab-1'))).not.toBeNull();
  });

  it('migra el carrito aún más viejo (sin usuario, clave plana) a la clave nueva por pestaña', () => {
    localStorage.setItem('pos-carrito-activo', JSON.stringify({ empresaId: 7, items: [{ producto: 'Item muy viejo' }] }));

    const { items, recuperado } = leerCarritoGuardado(7, 5, 1, 'tab-1');
    expect(recuperado).toBe(true);
    expect(items).toEqual([{ producto: 'Item muy viejo' }]);
    expect(localStorage.getItem('pos-carrito-activo')).toBeNull();
  });

  it('no migra si la empresa del carrito viejo no coincide con la empresa actual', () => {
    localStorage.setItem('pos-carrito-activo:7:5:1', JSON.stringify({ empresaId: 99, items: [{ producto: 'De otra empresa' }] }));

    const { items, recuperado } = leerCarritoGuardado(7, 5, 1, 'tab-1');
    expect(recuperado).toBe(false);
    expect(items).toEqual([]);
    // La clave vieja se consume igual (evita reintentar la migración fallida en cada carga).
    expect(localStorage.getItem('pos-carrito-activo:7:5:1')).toBeNull();
  });

  it('la migración ocurre UNA sola vez — la segunda lectura ya no encuentra nada que migrar', () => {
    localStorage.setItem('pos-carrito-activo:7:5:1', JSON.stringify({ empresaId: 7, items: [{ producto: 'X' }] }));
    leerCarritoGuardado(7, 5, 1, 'tab-1'); // primera lectura: migra

    localStorage.removeItem(claveCarrito(7, 5, 1, 'tab-1')); // simula que el cajero vació el carrito después
    const { items, recuperado } = leerCarritoGuardado(7, 5, 1, 'tab-1'); // segunda lectura
    expect(recuperado).toBe(false);
    expect(items).toEqual([]);
  });

  it('formato legado aún más viejo (array plano, sin empresaId): se descarta sin migrar', () => {
    localStorage.setItem('pos-carrito-activo', JSON.stringify([{ producto: 'Muy viejo' }]));
    const { items, recuperado } = leerCarritoGuardado(7, 5, 1, 'tab-1');
    expect(recuperado).toBe(false);
    expect(items).toEqual([]);
  });

  it('ventas en espera migran igual que el carrito, con su propia clave vieja per-usuario', () => {
    localStorage.setItem('pos-ventas-espera:7:5:1', JSON.stringify({ empresaId: 7, items: [{ nombre: 'Venta pausada' }] }));
    const { items, recuperado } = leerVentasEsperaGuardadas(7, 5, 1, 'tab-1');
    expect(recuperado).toBe(true);
    expect(items).toEqual([{ nombre: 'Venta pausada' }]);
  });
});

describe('carritoStorage — borrado (solo logout voluntario)', () => {
  it('borra tanto el carrito como las ventas en espera de la pestaña indicada', () => {
    guardarCarrito(7, 5, 1, 'tab-1', [{ a: 1 }]);
    guardarVentasEspera(7, 5, 1, 'tab-1', [{ b: 2 }]);

    borrarCarritoYEspera(7, 5, 1, 'tab-1');

    expect(leerCarritoGuardado(7, 5, 1, 'tab-1').items).toEqual([]);
    expect(leerVentasEsperaGuardadas(7, 5, 1, 'tab-1').items).toEqual([]);
  });

  it('no borra el carrito de OTRA pestaña — logout en una pestaña no afecta a la otra', () => {
    guardarCarrito(7, 5, 1, 'tab-1', [{ a: 1 }]);
    guardarCarrito(7, 5, 1, 'tab-2', [{ a: 2 }]);

    borrarCarritoYEspera(7, 5, 1, 'tab-1');

    expect(leerCarritoGuardado(7, 5, 1, 'tab-1').items).toEqual([]);
    expect(leerCarritoGuardado(7, 5, 1, 'tab-2').items).toEqual([{ a: 2 }]);
  });

  it('sin empresaId o userId no borra nada (evita construir una clave con "undefined")', () => {
    guardarCarrito(7, 5, 1, 'tab-1', [{ a: 1 }]);
    borrarCarritoYEspera(null, 5, 1, 'tab-1');
    borrarCarritoYEspera(7, null, 1, 'tab-1');
    expect(leerCarritoGuardado(7, 5, 1, 'tab-1').items).toEqual([{ a: 1 }]);
  });
});

describe('idDePestana — degradación si sessionStorage no está disponible', () => {
  it('no lanza y devuelve un valor usable si sessionStorage.getItem lanza', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('bloqueado'); });
    expect(() => idDePestana()).not.toThrow();
    expect(typeof idDePestana()).toBe('string');
    spy.mockRestore();
  });
});
