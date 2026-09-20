import { BadRequestException } from '@nestjs/common';
import { FacturasService } from './facturas.service';

/**
 * COSTO DE VENTA COMMIT 2 (2026-09-20) — validación C-4 unificada
 * (antes duplicada en create() y update()) más el flag permitirVentaBajoCosto
 * que la habilita/deshabilita por empresa. Se invocan los métodos privados
 * directamente: son lógica y una sola query, sin depender del módulo Nest
 * completo — mismo patrón que formas-pago.invariantes.spec.ts.
 */
describe('FacturasService — validarPrecioVsCosto (C-4)', () => {
  const validar = (producto: any, precioBase: number, permitirBajoCosto: boolean) =>
    (FacturasService.prototype as any).validarPrecioVsCosto.call({}, producto, precioBase, permitirBajoCosto);

  it('no hace nada si no hay producto (línea libre / servicio sin catálogo)', () => {
    expect(() => validar(null, -5, false)).not.toThrow();
  });

  it('rechaza precio en cero o negativo sin importar el flag', () => {
    const producto = { nombre: 'Producto X', costoPromedio: 0 };
    expect(() => validar(producto, 0, true)).toThrow(BadRequestException);
    expect(() => validar(producto, -1, true)).toThrow(/mayor a cero/);
    expect(() => validar(producto, 0, false)).toThrow(BadRequestException);
  });

  it('con permitirBajoCosto=true, deja vender por debajo del costo (promoción/liquidación)', () => {
    const producto = { nombre: 'Producto X', costoPromedio: 100 };
    expect(() => validar(producto, 50, true)).not.toThrow();
  });

  it('con permitirBajoCosto=false, bloquea vender por debajo del costo conocido', () => {
    const producto = { nombre: 'Producto X', costoPromedio: 100 };
    expect(() => validar(producto, 50, false)).toThrow(/no puede ser inferior al costo/);
  });

  it('con permitirBajoCosto=false, permite vender igual o por encima del costo', () => {
    const producto = { nombre: 'Producto X', costoPromedio: 100 };
    expect(() => validar(producto, 100, false)).not.toThrow();
    expect(() => validar(producto, 150, false)).not.toThrow();
  });

  it('con permitirBajoCosto=false pero costoPromedio=0 (producto aún no tocado por AVCO), no bloquea', () => {
    const producto = { nombre: 'Producto X', costoPromedio: 0 };
    expect(() => validar(producto, 1, false)).not.toThrow();
  });
});

describe('FacturasService — permitirVentaBajoCosto (resolución del flag)', () => {
  const makeService = (rows: unknown[]) => {
    const query = jest.fn().mockResolvedValue(rows);
    const ctx = { dataSource: { query } };
    const call = (empresaId: number) =>
      (FacturasService.prototype as any).permitirVentaBajoCosto.call(ctx, empresaId);
    return { call, query };
  };

  it('devuelve el valor de la columna cuando la empresa existe', async () => {
    const { call, query } = makeService([{ permitirVentaBajoCosto: false }]);
    await expect(call(7)).resolves.toBe(false);
    expect(query.mock.calls[0][0]).toMatch(/FROM empresa WHERE id = \$1/);
    expect(query.mock.calls[0][1]).toEqual([7]);
  });

  it('devuelve true (default seguro) si la empresa no aparece en la consulta', async () => {
    const { call } = makeService([]);
    await expect(call(999)).resolves.toBe(true);
  });

  it('devuelve true si la columna llega null por algún camino raro', async () => {
    const { call } = makeService([{ permitirVentaBajoCosto: null }]);
    await expect(call(7)).resolves.toBe(true);
  });
});
