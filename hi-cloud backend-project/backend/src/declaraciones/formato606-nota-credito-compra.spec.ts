/**
 * Formato 606 — notas de crédito de compra (2026-09-24).
 *
 * getFormato606() solo leía compras + gastos: las NC de compra (el
 * proveedor emite su propia E34/B04 y HiCloud la registra) no aparecían en
 * el 606 en absoluto — ni siquiera con la columna vacía, como sí pasaba con
 * "NCF Modificado" en el 607 antes de 9799f69e. Mismo patrón de fix que esa
 * commit, en la dirección de compras: UNION ALL con una tercera fuente,
 * "NCF Modificado" = el NCF de la COMPRA que la NC corrige (no el de la NC
 * misma, que va en la columna "NCF").
 */

import { DeclaracionesService } from './declaraciones.service';

function makeService(rows: any[]) {
  const query = jest.fn((sql: string) => {
    if (sql.includes('FROM empresa')) return Promise.resolve([{ rnc: '101000000' }]);
    return Promise.resolve(rows);
  });
  const svc: any = Object.create(DeclaracionesService.prototype);
  svc.dataSource = { query };
  svc.tenantSvc  = { getEmpresaId: () => 7 };
  return svc as DeclaracionesService;
}

const FILA_NCC = {
  id: 1, folio: 'NCC-1', fechaComprobante: '2026-09-10', fechaPago: '2026-09-10',
  total: '118', itbis: '18', ncfProveedor: 'E340000001234',
  ncfModificado: 'B0100000045', // el NCF de la compra que esta NC corrige
  tipoBienes: '09', formaPago: '04', rncProveedor: '101000000',
  nombreProveedor: 'Proveedor Test', _source: 'nota_credito_compra',
  retieneItbis: false, montoRetencionItbis: '0', retieneIsr: false, montoRetencionIsr: '0',
};

describe('DeclaracionesService.getFormato606() — notas de crédito de compra', () => {
  it('una NC de compra entra al 606 con source="nota_credito_compra"', async () => {
    const svc = makeService([{ ...FILA_NCC }]);
    const r = await svc.getFormato606(9, 2026);
    expect(r.filas).toHaveLength(1);
    expect(r.filas[0].source).toBe('nota_credito_compra');
  });

  it('"NCF" es el de la NC (del proveedor) — "NCF Modificado" es el de la compra que corrige', async () => {
    const svc = makeService([{ ...FILA_NCC }]);
    const r = await svc.getFormato606(9, 2026);
    expect(r.filas[0].ncfProveedor).toBe('E340000001234');
    expect(r.filas[0].ncfModificado).toBe('B0100000045');
  });

  it('sin compraOriginalId (ajuste sin OC puntual): ncfModificado queda vacío, no bloquea la fila', async () => {
    const svc = makeService([{ ...FILA_NCC, ncfModificado: null }]);
    const r = await svc.getFormato606(9, 2026);
    expect(r.filas[0].ncfModificado).toBe('');
  });

  it('monto/ITBIS de la NC entran en positivo — no se resta del total, DGII la distingue por su propio NCF', async () => {
    const svc = makeService([{ ...FILA_NCC }]);
    const r = await svc.getFormato606(9, 2026);
    expect(r.filas[0].montoFacturado).toBe(118);
    expect(r.filas[0].itbis).toBe(18);
    expect(r.totalMonto).toBe(118);
  });

  it('una compra (source="compra") no trae ncfModificado — columna en blanco, no undefined', async () => {
    const svc = makeService([{
      id: 5, folio: 'COMP-5', fechaComprobante: '2026-09-01', fechaPago: '2026-09-01',
      total: '1180', itbis: '180', ncfProveedor: 'B0100000001',
      tipoBienes: '09', formaPago: '01', rncProveedor: '101000000',
      nombreProveedor: 'Proveedor Test', _source: 'compra',
      retieneItbis: false, montoRetencionItbis: '0', retieneIsr: false, montoRetencionIsr: '0',
    }]);
    const r = await svc.getFormato606(9, 2026);
    expect(r.filas[0].ncfModificado).toBe('');
  });
});
