/**
 * generar606Txt() — campo 5 "NCF Modificado" (2026-09-24).
 *
 * Antes salía '' fijo — igual que le pasaba al 607 antes de 9799f69e — no
 * porque el dato no existiera sino porque nada lo pedía. Ahora getFormato606()
 * lo trae para las filas de NC de compra (ncfModificado = NCF de la compra
 * que corrige) y el TXT solo tiene que leerlo, mismo patrón que ya se usó
 * para el 607.
 */

import { DgiiTxtGeneratorService } from './dgii-txt.generator';

function makeGenerator(fila: any) {
  const svc: any = {
    getFormato606: jest.fn().mockResolvedValue({ rnc: '101000000', filas: [fila] }),
    guardarReporte: jest.fn().mockResolvedValue(undefined),
  };
  return new DgiiTxtGeneratorService(svc);
}

const FILA_BASE = {
  rncProveedor: '101000000', tipoId: '1', ncfProveedor: 'B0100000001',
  fechaComprobante: '2026-09-01', fechaPago: '2026-09-01',
  montoFacturado: 1000, itbis: 180, formaPago: '01',
  retencionITBIS: 0, retencionISR: 0, tipoRetencionISR: '',
};

describe('generar606Txt() — campo 5 NCF Modificado', () => {
  it('una compra normal (sin NC): campo 5 vacío', async () => {
    const gen = makeGenerator({ ...FILA_BASE, ncfModificado: '' });
    const { content } = await gen.generar606Txt(9, 2026);
    const campos = content.split('\r\n')[1].split('|');
    expect(campos[4]).toBe('');
  });

  it('una NC de compra: campo 4 es SU NCF, campo 5 es el de la compra que corrige', async () => {
    const gen = makeGenerator({
      ...FILA_BASE, ncfProveedor: 'E340000001234', ncfModificado: 'B0100000045',
    });
    const { content } = await gen.generar606Txt(9, 2026);
    const campos = content.split('\r\n')[1].split('|');
    expect(campos[3]).toBe('E340000001234'); // campo 4: NCF
    expect(campos[4]).toBe('B0100000045');    // campo 5: NCF Modificado
  });
});
