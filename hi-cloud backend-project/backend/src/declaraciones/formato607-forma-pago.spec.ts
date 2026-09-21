/**
 * Formato 607 — desglose de forma de pago (2026-09-19).
 *
 * Antes, getFormato607() derivaba el método de pago con match de texto
 * sobre f.notas (campo libre) y elegía UN solo bucket por factura. Ahora usa
 * el dato real — Factura.formasPago, poblado desde el trabajo del e-CF — y
 * reparte proporcionalmente entre las columnas 17-23 del 607 con el mismo
 * traductor que usa el 606 (mapFormaPagoDgii/columna607PorCodigoDgii, en
 * dgii.constants.ts). El match sobre notas queda SOLO como fallback para
 * facturas históricas sin formasPago (decisión confirmada con el usuario).
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
  id: 1, folio: 'FAC-1', fechaComprobante: '2026-09-01',
  subtotal: '1000', iva: '180', total: '1180',
  tipoNcf: 'E32', notas: '', encf: 'E320000000001', estadoDgii: 'aceptado',
  rncComprador: '101000000', nombreComprador: 'Cliente Test',
};

describe('DeclaracionesService.getFormato607() — desglose de forma de pago', () => {
  it('pago único en efectivo: todo el monto va a la columna Efectivo', async () => {
    const svc = makeService([{ ...BASE_ROW, formasPago: [{ tipo: 1, monto: 1180 }] }]);
    const r = await svc.getFormato607(9, 2026);
    expect(r.filas[0].efectivo).toBe(1180);
    expect(r.filas[0].tarjeta).toBe(0);
    expect(r.filas[0].credito).toBe(0);
  });

  it('pago mixto (efectivo + tarjeta): se REPARTE entre columnas, no elige una', async () => {
    const svc = makeService([{
      ...BASE_ROW,
      formasPago: [{ tipo: 1, monto: 700 }, { tipo: 3, monto: 480 }],
    }]);
    const r = await svc.getFormato607(9, 2026);
    expect(r.filas[0].efectivo).toBe(700);
    expect(r.filas[0].tarjeta).toBe(480);
    expect(r.filas[0].efectivo + r.filas[0].tarjeta).toBe(1180);
  });

  it('los 6 tipos DGII-nativos caen en su columna correcta, incluida Nota de Crédito → Otras', async () => {
    const svc = makeService([
      { ...BASE_ROW, id: 1, formasPago: [{ tipo: 1, monto: 100 }] }, // Efectivo
      { ...BASE_ROW, id: 2, formasPago: [{ tipo: 2, monto: 100 }] }, // Cheque/Transferencia
      { ...BASE_ROW, id: 3, formasPago: [{ tipo: 3, monto: 100 }] }, // Tarjeta
      { ...BASE_ROW, id: 4, formasPago: [{ tipo: 4, monto: 100 }] }, // Crédito
      { ...BASE_ROW, id: 5, formasPago: [{ tipo: 5, monto: 100 }] }, // Permuta
      { ...BASE_ROW, id: 6, formasPago: [{ tipo: 6, monto: 100 }] }, // Nota de Crédito
    ]);
    const r = await svc.getFormato607(9, 2026);
    expect(r.filas[0]).toMatchObject({ efectivo: 100 });
    expect(r.filas[1]).toMatchObject({ chequeTransferencia: 100 });
    expect(r.filas[2]).toMatchObject({ tarjeta: 100 });
    expect(r.filas[3]).toMatchObject({ credito: 100 });
    expect(r.filas[4]).toMatchObject({ permuta: 100 });
    expect(r.filas[5]).toMatchObject({ otras: 100 }); // Nota de Crédito, sin columna propia
    expect(r.totales.permuta).toBe(100);
    expect(r.totales.otras).toBe(100);
  });

  it('factura histórica SIN formasPago: cae al match de texto sobre notas (fallback confirmado)', async () => {
    const svc = makeService([{ ...BASE_ROW, formasPago: null, notas: 'Pago en Tarjeta' }]);
    const r = await svc.getFormato607(9, 2026);
    expect(r.filas[0].tarjeta).toBe(1180);
    expect(r.filas[0].efectivo).toBe(0);
  });

  it('factura histórica sin formasPago y sin texto reconocible: cae en Crédito (comportamiento anterior, sin cambios)', async () => {
    const svc = makeService([{ ...BASE_ROW, formasPago: null, notas: 'Venta del mostrador' }]);
    const r = await svc.getFormato607(9, 2026);
    expect(r.filas[0].credito).toBe(1180);
  });

  it('formasPago vacío ([]) se trata igual que null: usa el fallback de notas', async () => {
    const svc = makeService([{ ...BASE_ROW, formasPago: [], notas: 'Efectivo' }]);
    const r = await svc.getFormato607(9, 2026);
    expect(r.filas[0].efectivo).toBe(1180);
  });

  it('tipo no reconocido dentro de formasPago no se suma a ninguna columna (no adivina)', async () => {
    const svc = makeService([{ ...BASE_ROW, formasPago: [{ tipo: 99, monto: 1180 }] }]);
    const r = await svc.getFormato607(9, 2026);
    const { linea, id, tipoDocumento, folio, encf, ncfModificado, estadoDgii, tipoNcf, rncComprador, nombreComprador, tipoId,
            tipoIngreso, fechaComprobante, montoFacturado, itbis, itbisFuente, desglose607, itbisRetenido, isrRetenido, ...cols } = r.filas[0];
    expect(Object.values(cols).every(v => v === 0)).toBe(true);
  });
});
