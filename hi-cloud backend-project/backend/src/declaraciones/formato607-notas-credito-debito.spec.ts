/**
 * Formato 607 — notas de crédito/débito como líneas propias (2026-09-21).
 *
 * Antes, getFormato607() solo leía `facturas`: las E34/E33 del período no
 * aparecían en el 607 en absoluto, aunque cada una es su propia línea
 * obligatoria del formato (instructivo DGII, col. 5 "NCF o Documento
 * Modificado" — confirmado contra ayuda.dgii.gov.do/CA2108 y el hilo "Notas
 * de Credito en el 607"). Bug independiente #2: el TXT ya tenía la columna 4
 * en su layout, pero hardcodeada en '' siempre — dgii-txt.generator.ts.
 *
 * Regla DGII confirmada por dos fuentes independientes: las columnas 17-23
 * (forma de pago) se EXIMEN solo para notas de CRÉDITO, no para las de
 * débito.
 */

import { DeclaracionesService } from './declaraciones.service';
import { DgiiValidatorService, Fila607 } from './dgii-validator.service';

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

const FACTURA = {
  tipoDocumento: 'FACTURA', id: 1, folio: 'FAC-100', fechaComprobante: '2026-08-05',
  subtotal: '1000', iva: '180', total: '1180',
  tipoNcf: 'E32', notas: '', formasPago: [{ tipo: 1, monto: 1180 }],
  encf: 'E320000006902', estadoDgii: 'aceptado', ncfModificado: null,
  rncComprador: '101000000', nombreComprador: 'Cliente Test',
};

const NOTA_CREDITO = {
  tipoDocumento: 'NOTA_CREDITO', id: 84, folio: 'NC-142', fechaComprobante: '2026-08-08',
  subtotal: '200', iva: '36', total: '236',
  tipoNcf: 'E34', notas: '',
  encf: 'E340000000032', estadoDgii: 'aceptado', ncfModificado: 'E320000006902',
  rncComprador: '101000000', nombreComprador: 'Cliente Test',
};

const NOTA_DEBITO = {
  tipoDocumento: 'NOTA_DEBITO', id: 1, folio: 'ND-10', fechaComprobante: '2026-08-09',
  subtotal: '50', iva: '9', total: '59',
  tipoNcf: 'E33', notas: '',
  encf: 'E330000000001', estadoDgii: 'aceptado', ncfModificado: 'E320000006902',
  rncComprador: '101000000', nombreComprador: 'Cliente Test',
};

describe('DeclaracionesService.getFormato607() — notas de crédito/débito', () => {
  it('factura + su E34 en el mismo período: dos líneas, la NC con NCF Modificado = eNCF de la factura', async () => {
    const svc = makeService([FACTURA, NOTA_CREDITO]);
    const r = await svc.getFormato607(8, 2026);

    expect(r.filas).toHaveLength(2);
    const factura = r.filas.find(f => f.tipoDocumento === 'FACTURA')!;
    const nc      = r.filas.find(f => f.tipoDocumento === 'NOTA_CREDITO')!;

    expect(factura.ncfModificado).toBe('');
    expect(nc.encf).toBe('E340000000032');
    expect(nc.ncfModificado).toBe('E320000006902'); // eNCF de la factura original
    expect(nc.ncfModificado).toBe(factura.encf);
  });

  it('E34 que modifica una factura de un período anterior: la NC igual aparece con su NCF Modificado, la factura no', async () => {
    // La factura de julio no la devuelve el query (fuera de rango) — solo la nota de agosto.
    const svc = makeService([{ ...NOTA_CREDITO, ncfModificado: 'E320000005000' }]);
    const r = await svc.getFormato607(8, 2026);

    expect(r.filas).toHaveLength(1);
    expect(r.filas[0].tipoDocumento).toBe('NOTA_CREDITO');
    expect(r.filas[0].ncfModificado).toBe('E320000005000');
  });

  it('E34 sin NCF original guardado: no se deja en blanco en silencio — validar607 la bloquea', async () => {
    const svc = makeService([{ ...NOTA_CREDITO, encf: '', estadoDgii: '', ncfModificado: null }]);
    const r = await svc.getFormato607(8, 2026);

    expect(r.filas[0].ncfModificado).toBe('');

    const validator  = new DgiiValidatorService();
    const resultado   = validator.validar607(r.filas as Fila607[]);
    expect(resultado.valido).toBe(false);
    expect(resultado.errores.some(e => e.campo === 'NCF Modificado')).toBe(true);
  });

  it('nota de crédito CON e-CF pero sin ncfModificado (caso atípico): también la bloquea', async () => {
    const svc = makeService([{ ...NOTA_CREDITO, ncfModificado: null }]);
    const r = await svc.getFormato607(8, 2026);

    const validator = new DgiiValidatorService();
    const resultado  = validator.validar607(r.filas as Fila607[]);
    expect(resultado.valido).toBe(false);
    expect(resultado.errores.some(e => e.campo === 'NCF Modificado' && e.referencia === 'E340000000032')).toBe(true);
  });

  it('nota de crédito: columnas 17-23 (forma de pago) quedan en 0 — DGII las exime', async () => {
    const svc = makeService([NOTA_CREDITO]);
    const r = await svc.getFormato607(8, 2026);

    const nc = r.filas[0];
    expect(nc.efectivo).toBe(0);
    expect(nc.chequeTransferencia).toBe(0);
    expect(nc.tarjeta).toBe(0);
    expect(nc.credito).toBe(0);
    expect(nc.bonos).toBe(0);
    expect(nc.permuta).toBe(0);
    expect(nc.otras).toBe(0);
  });

  it('nota de débito: DGII SÍ exige forma de pago — sin dato real, se asume Crédito completo', async () => {
    const svc = makeService([NOTA_DEBITO]);
    const r = await svc.getFormato607(8, 2026);

    const nd = r.filas[0];
    expect(nd.credito).toBe(59);
    expect(nd.efectivo).toBe(0);
  });

  it('tipoIngreso de una NC/ND sigue siendo "01", igual que las facturas normales', async () => {
    const svc = makeService([NOTA_CREDITO, NOTA_DEBITO]);
    const r = await svc.getFormato607(8, 2026);
    expect(r.filas.every(f => f.tipoIngreso === '01')).toBe(true);
  });

  it('los totales del período incluyen el monto/ITBIS de las notas', async () => {
    const svc = makeService([FACTURA, NOTA_CREDITO]);
    const r = await svc.getFormato607(8, 2026);
    expect(r.totales.montoFacturado).toBe(1000 + 200);
    expect(r.totales.itbis).toBe(180 + 36);
  });
});
