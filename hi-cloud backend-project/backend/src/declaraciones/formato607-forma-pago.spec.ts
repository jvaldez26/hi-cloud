/**
 * Formato 607 — desglose de forma de pago (2026-09-19, endurecido 2026-10-08).
 *
 * Antes, getFormato607() derivaba el método de pago con match de texto
 * sobre f.notas (campo libre) y elegía UN solo bucket por factura. Ahora usa
 * el dato real — Factura.formasPago, poblado desde el trabajo del e-CF — y
 * reparte proporcionalmente entre las columnas 17-23 del 607 con el mismo
 * traductor que usa el 606 (mapFormaPagoDgii/columna607PorCodigoDgii, en
 * dgii.constants.ts). El match sobre notas queda SOLO como fallback para
 * facturas históricas sin formasPago (decisión confirmada con el usuario).
 *
 * 2026-10-08 (Sentry/auditoría — 5,377 CONTADO sin formasPago encontradas,
 * 5,331 ya emitida/pagada): el fallback anterior, al no reconocer el texto
 * de notas, caía TODO a la columna Crédito — una venta de contado real
 * terminaba reportada a DGII como pendiente de cobro. Dos cambios:
 *   1. El match de notas ya NO es por substring libre — solo reconoce el
 *      formato EXACTO que escribe el código (metodoPagoDesdeNotasExacto en
 *      dgii.constants.ts): "POS · Efectivo/Tarjeta/Transfer.[...]" o,
 *      textual, "Efectivo"/"Tarjeta"/"Transferencia" (cobrarDesdePos).
 *   2. Una factura tipoPago=CONTADO sin formasPago y sin match exacto YA
 *      NUNCA cae en Crédito — va a "Otras formas de venta" (columna 23,
 *      el cajón oficial de DGII para esto). Crédito solo se usa cuando
 *      tipoPago=CREDITO de verdad.
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
  tipoPago: 'CONTADO', // default real de la entidad — todas las filas abajo lo tienen
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

  it('factura histórica SIN formasPago y notas con el formato EXACTO del POS: cae en la columna real', async () => {
    const svc = makeService([{ ...BASE_ROW, formasPago: null, notas: 'POS · Tarjeta' }]);
    const r = await svc.getFormato607(9, 2026);
    expect(r.filas[0].tarjeta).toBe(1180);
    expect(r.filas[0].efectivo).toBe(0);
    expect(r.filas[0].otras).toBe(0);
  });

  it('notas con mención LIBRE de la palabra (no el formato exacto) ya NO se reconoce — va a Otras, no a la columna mencionada', async () => {
    const svc = makeService([{ ...BASE_ROW, formasPago: null, notas: 'Pago en Tarjeta' }]);
    const r = await svc.getFormato607(9, 2026);
    expect(r.filas[0].tarjeta).toBe(0);
    expect(r.filas[0].otras).toBe(1180);
  });

  it('CONTADO sin formasPago y sin texto reconocible: cae en "Otras formas de venta", NUNCA en Crédito', async () => {
    const svc = makeService([{ ...BASE_ROW, formasPago: null, notas: 'Venta del mostrador' }]);
    const r = await svc.getFormato607(9, 2026);
    expect(r.filas[0].otras).toBe(1180);
    expect(r.filas[0].credito).toBe(0);
  });

  it('CONTADO sin formasPago y SIN notas (vacío/null): también va a "Otras", nunca a Crédito', async () => {
    const svc = makeService([{ ...BASE_ROW, formasPago: null, notas: null }]);
    const r = await svc.getFormato607(9, 2026);
    expect(r.filas[0].otras).toBe(1180);
    expect(r.filas[0].credito).toBe(0);
  });

  it('CREDITO explícito sin formasPago: sigue cayendo en Crédito, sin cambios — el crédito no lleva cobro todavía', async () => {
    const svc = makeService([{ ...BASE_ROW, tipoPago: 'CREDITO', formasPago: null, notas: '' }]);
    const r = await svc.getFormato607(9, 2026);
    expect(r.filas[0].credito).toBe(1180);
    expect(r.filas[0].otras).toBe(0);
  });

  it('notas "POS · Crédito N días" en una factura CONTADO (incoherente): va a Otras y se lista para revisión', async () => {
    const svc = makeService([{ ...BASE_ROW, id: 42, folio: 'FAC-42', formasPago: null, notas: 'POS · Crédito 30 días' }]);
    const r = await svc.getFormato607(9, 2026);
    expect(r.filas[0].otras).toBe(1180);
    expect(r.filas[0].credito).toBe(0);
    expect(r.incoherenciasFormaPago).toEqual([
      { facturaId: 42, folio: 'FAC-42', notas: 'POS · Crédito 30 días' },
    ]);
  });

  it('notas "Crédito N días" (formato de cobrarDesdePos) en CONTADO también cuenta como incoherente', async () => {
    const svc = makeService([{ ...BASE_ROW, formasPago: null, notas: 'Crédito 30 días' }]);
    const r = await svc.getFormato607(9, 2026);
    expect(r.filas[0].otras).toBe(1180);
    expect(r.incoherenciasFormaPago).toHaveLength(1);
  });

  it('sin incoherencias cuando todo está en orden: la lista viene vacía', async () => {
    const svc = makeService([{ ...BASE_ROW, formasPago: [{ tipo: 1, monto: 1180 }] }]);
    const r = await svc.getFormato607(9, 2026);
    expect(r.incoherenciasFormaPago).toEqual([]);
  });

  it('POS · Efectivo con sufijo de propina: el startsWith reconoce el prefijo exacto igual', async () => {
    const svc = makeService([{ ...BASE_ROW, formasPago: null, notas: 'POS · Efectivo · Propina: RD$50.00' }]);
    const r = await svc.getFormato607(9, 2026);
    expect(r.filas[0].efectivo).toBe(1180);
  });

  it('notas EXACTAMENTE "Transferencia" (formato de cobrarDesdePos, sin prefijo POS): cae en chequeTransferencia', async () => {
    const svc = makeService([{ ...BASE_ROW, formasPago: null, notas: 'Transferencia' }]);
    const r = await svc.getFormato607(9, 2026);
    expect(r.filas[0].chequeTransferencia).toBe(1180);
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
