/**
 * generar606Txt() — campos 10-20, ver dgii-txt.generator.ts (2026-09-19).
 *
 * Antes: campos 10 (ITBIS retenido), 11 (proporcionalidad), 12 (ITBIS
 * costo), 14 (ITBIS percibido), 15 (tipo retención ISR), 16 (retención
 * renta) y 17 (ISR percibido) salían en cero fijo, sin leer nada de la
 * fila. Ahora 10/15/16 leen el dato real que ya calcula getFormato606();
 * 11/12/14/17 (y 18-20: ISC/otros impuestos/propina) siguen en 0 porque el
 * ERP genuinamente no los calcula — documentado en el código, no en
 * silencio.
 */

import { DgiiTxtGeneratorService } from './dgii-txt.generator';

function makeGenerator(fila: any) {
  const svc: any = {
    getFormato606: jest.fn().mockResolvedValue({
      rnc: '101000000',
      filas: [fila],
    }),
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

describe('generar606Txt() — campos de retención', () => {
  it('sin retención: campo 10 y 16 en 0, campo 15 vacío', async () => {
    const gen = makeGenerator({ ...FILA_BASE });
    const { content } = await gen.generar606Txt(9, 2026);
    const campos = content.split('\r\n')[1].split('|');
    expect(campos[9]).toBe('0');  // campo 10 (índice 9): ITBIS retenido
    expect(campos[14]).toBe(''); // campo 15: tipo retención ISR
    expect(campos[15]).toBe('0'); // campo 16: retención renta
  });

  it('con retención E41 (ITBIS+ISR): campos 10, 15 y 16 llevan el dato real', async () => {
    const gen = makeGenerator({
      ...FILA_BASE, retencionITBIS: 54, retencionISR: 100, tipoRetencionISR: '03',
    });
    const { content } = await gen.generar606Txt(9, 2026);
    const campos = content.split('\r\n')[1].split('|');
    expect(campos[9]).toBe('5400');  // centavos
    expect(campos[14]).toBe('03');
    expect(campos[15]).toBe('10000'); // centavos
  });

  it('campos genuinamente no calculables (11, 12, 14, 17, 18, 19, 20) siempre en 0', async () => {
    const gen = makeGenerator({
      ...FILA_BASE, retencionITBIS: 54, retencionISR: 100, tipoRetencionISR: '03',
    });
    const { content } = await gen.generar606Txt(9, 2026);
    const campos = content.split('\r\n')[1].split('|');
    expect(campos[10]).toBe('0'); // 11 proporcionalidad
    expect(campos[11]).toBe('0'); // 12 ITBIS costo
    expect(campos[13]).toBe('0'); // 14 ITBIS percibido
    expect(campos[16]).toBe('0'); // 17 ISR percibido
    expect(campos[17]).toBe('0'); // 18 ISC
    expect(campos[18]).toBe('0'); // 19 otros impuestos
    expect(campos[19]).toBe('0'); // 20 propina
  });

  it('sigue teniendo 21 campos exactos (no se corrió el layout al agregar los comentarios)', async () => {
    const gen = makeGenerator({ ...FILA_BASE });
    const { content } = await gen.generar606Txt(9, 2026);
    const campos = content.split('\r\n')[1].split('|');
    expect(campos).toHaveLength(21);
  });
});
