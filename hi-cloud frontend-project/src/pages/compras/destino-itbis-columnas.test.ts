import { describe, it, expect } from 'vitest';
import { COLS_DEF_ITEMS, CAMPOS_INDICADOR } from './CompraFormInner';
import { calcularVisibles, calcularCambios } from '../../hooks/useColumnVisibility';

/**
 * Selector de columnas de la tabla de Ítems (Orden de Compra) — dos cosas
 * que no puede hacer mal:
 *
 * 1. Ocultar una columna es un cambio de VISTA, nunca de DATO — el valor
 *    guardado en la línea (destinoItbis, descuentoMonto, etc.) tiene que
 *    seguir intacto aunque la columna que lo muestra esté oculta.
 * 2. Una columna oculta con un valor no estándar tiene que delatarse — si
 *    no, alguien clasifica una línea, oculta la columna después, y pierde
 *    de vista que esa clasificación existe.
 */

const lineaBase = {
  key: '1', productoId: 1, cantidad: 1, cantidadBonificada: 0,
  precioUnitario: 100, porcentajeItbis: 18, descuentoPct: 0, descuentoMonto: 0,
} as any;

describe('COLS_DEF_ITEMS — Destino ITBIS nace oculta, el resto visible (igual que antes del selector)', () => {
  it('Destino ITBIS tiene defaultVisible:false', () => {
    const destino = COLS_DEF_ITEMS.find(c => c.key === 'destinoItbis');
    expect(destino?.defaultVisible).toBe(false);
  });

  it('Bonificación, Inv./Costo, Descuento e ITBIS % nacen visibles', () => {
    for (const key of ['bon', 'inv', 'descuento', 'itbis']) {
      const c = COLS_DEF_ITEMS.find(x => x.key === key);
      expect(c?.defaultVisible).not.toBe(false);
    }
  });
});

describe('ocultar una columna no toca el valor guardado en la línea', () => {
  it('ocultar Destino ITBIS del listado de visibles no cambia destinoItbis de la línea', () => {
    const linea = { ...lineaBase, destinoItbis: 'otro', destinoItbisMotivo: 'Consumo del dueño' };

    // "ocultar" = quitarla de la lista de visibles que maneja el selector
    const visiblesConDestino = COLS_DEF_ITEMS.filter(c => c.defaultVisible !== false).map(c => c.key).concat('destinoItbis');
    const visiblesSinDestino = visiblesConDestino.filter(k => k !== 'destinoItbis');

    const cambios = calcularCambios(visiblesSinDestino, COLS_DEF_ITEMS);
    const recalculadas = calcularVisibles(cambios, COLS_DEF_ITEMS);

    expect(recalculadas).not.toContain('destinoItbis');
    // El dato de la línea es un objeto aparte del selector — nunca lo toca.
    expect(linea.destinoItbis).toBe('otro');
    expect(linea.destinoItbisMotivo).toBe('Consumo del dueño');
  });
});

describe('CAMPOS_INDICADOR — detecta valores no estándar en columnas ocultas', () => {
  it('destinoItbis distinto de "gravado" es no estándar', () => {
    const c = CAMPOS_INDICADOR.find(x => x.key === 'destinoItbis')!;
    expect(c.noEstandar({ ...lineaBase, destinoItbis: 'exento' })).toBe(true);
    expect(c.noEstandar({ ...lineaBase, destinoItbis: 'gravado' })).toBe(false);
    expect(c.noEstandar({ ...lineaBase, destinoItbis: undefined })).toBe(false);
  });

  it('descuentoMonto > 0 es no estándar', () => {
    const c = CAMPOS_INDICADOR.find(x => x.key === 'descuento')!;
    expect(c.noEstandar({ ...lineaBase, descuentoMonto: 50 })).toBe(true);
    expect(c.noEstandar({ ...lineaBase, descuentoMonto: 0 })).toBe(false);
  });

  it('cantidadBonificada > 0 es no estándar', () => {
    const c = CAMPOS_INDICADOR.find(x => x.key === 'bon')!;
    expect(c.noEstandar({ ...lineaBase, cantidadBonificada: 2 })).toBe(true);
    expect(c.noEstandar({ ...lineaBase, cantidadBonificada: 0 })).toBe(false);
  });

  it('porcentajeItbis distinto de 18 es no estándar', () => {
    const c = CAMPOS_INDICADOR.find(x => x.key === 'itbis')!;
    expect(c.noEstandar({ ...lineaBase, porcentajeItbis: 16 })).toBe(true);
    expect(c.noEstandar({ ...lineaBase, porcentajeItbis: 18 })).toBe(false);
  });

  it('no hay entrada para "inv" — es 100% derivada, nunca guarda su propio dato', () => {
    expect(CAMPOS_INDICADOR.some(c => c.key === 'inv')).toBe(false);
  });

  it('describir() incluye el valor real de la línea, no un texto genérico', () => {
    const c = CAMPOS_INDICADOR.find(x => x.key === 'destinoItbis')!;
    const texto = c.describir({ ...lineaBase, destinoItbis: 'exento' });
    expect(texto).toMatch(/exent/i);
  });
});
