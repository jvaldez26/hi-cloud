/**
 * Formato 606 — campos de retención (2026-09-19).
 *
 * getFormato606() exponía retencionISR/retencionITBIS en 0 fijo, aunque el
 * dato real ya existe en Compra (retieneItbis/montoRetencionItbis,
 * retieneIsr/montoRetencionIsr — la retención E41 por comprar a un
 * proveedor informal). Ahora los lee de verdad. Gasto nunca participa de
 * esta retención — sus filas siempre llegan en false/0 desde el SQL.
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

const BASE_ROW = {
  id: 1, folio: 'COMP-1', fechaComprobante: '2026-09-01', fechaPago: '2026-09-01',
  total: '1180', itbis: '180', ncfProveedor: 'B0100000001',
  tipoBienes: '09', formaPago: '01', rncProveedor: '101000000',
  nombreProveedor: 'Proveedor Test', _source: 'compra',
  retieneItbis: false, montoRetencionItbis: '0', retieneIsr: false, montoRetencionIsr: '0',
};

describe('DeclaracionesService.getFormato606() — campos de retención', () => {
  it('compra sin retención: retencionISR/retencionITBIS/tipoRetencionISR en 0/vacío', async () => {
    const svc = makeService([{ ...BASE_ROW }]);
    const r = await svc.getFormato606(9, 2026);
    expect(r.filas[0].retencionITBIS).toBe(0);
    expect(r.filas[0].retencionISR).toBe(0);
    expect(r.filas[0].tipoRetencionISR).toBe('');
  });

  it('compra E41 con retención ITBIS+ISR: se leen los montos reales de Compra', async () => {
    const svc = makeService([{
      ...BASE_ROW,
      retieneItbis: true, montoRetencionItbis: '54',
      retieneIsr: true, montoRetencionIsr: '100',
    }]);
    const r = await svc.getFormato606(9, 2026);
    expect(r.filas[0].retencionITBIS).toBe(54);
    expect(r.filas[0].retencionISR).toBe(100);
    expect(r.filas[0].tipoRetencionISR).toBe('03'); // Otras Rentas — confirmado con el usuario
  });

  it('solo retiene ITBIS (no ISR): tipoRetencionISR queda vacío, no se inventa un tipo sin retención de renta', async () => {
    const svc = makeService([{ ...BASE_ROW, retieneItbis: true, montoRetencionItbis: '54' }]);
    const r = await svc.getFormato606(9, 2026);
    expect(r.filas[0].retencionITBIS).toBe(54);
    expect(r.filas[0].retencionISR).toBe(0);
    expect(r.filas[0].tipoRetencionISR).toBe('');
  });

  it('fila de gasto: retención siempre en 0/false, aunque el SQL la traiga en columnas fijas', async () => {
    const svc = makeService([{
      ...BASE_ROW, id: 2, _source: 'gasto', folio: null,
      retieneItbis: false, montoRetencionItbis: '0', retieneIsr: false, montoRetencionIsr: '0',
    }]);
    const r = await svc.getFormato606(9, 2026);
    expect(r.filas[0].retencionITBIS).toBe(0);
    expect(r.filas[0].retencionISR).toBe(0);
  });
});
