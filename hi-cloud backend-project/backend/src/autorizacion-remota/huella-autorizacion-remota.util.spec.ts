import { huellaCoincide, huellaDesdeBody } from './huella-autorizacion-remota.util';

describe('huellaCoincide — "si el cajero cambia el carrito después de pedir, la autorización queda inválida"', () => {
  it('sin huella aprobada (token presencial o remoto sin dato disponible): nunca bloquea', () => {
    expect(huellaCoincide({}, { monto: 999, clienteId: 1, facturaId: 2 })).toBe(true);
  });

  it('monto idéntico: coincide', () => {
    expect(huellaCoincide({ monto: 1500 }, { monto: 1500 })).toBe(true);
  });

  it('monto con diferencia de redondeo (<= 1 centavo): coincide', () => {
    expect(huellaCoincide({ monto: 1500.005 }, { monto: 1500.0 })).toBe(true);
  });

  it('el cajero cambió el carrito y el monto real ya no coincide: rechaza', () => {
    expect(huellaCoincide({ monto: 1500 }, { monto: 2200 })).toBe(false);
  });

  it('cliente distinto al aprobado: rechaza', () => {
    expect(huellaCoincide({ clienteId: 10 }, { clienteId: 99 })).toBe(false);
  });

  it('factura distinta a la aprobada: rechaza', () => {
    expect(huellaCoincide({ facturaId: 500 }, { facturaId: 501 })).toBe(false);
  });

  it('monto real ausente cuando se aprobó con un monto: rechaza (fail-closed, no "sin dato = pasa")', () => {
    expect(huellaCoincide({ monto: 1500 }, {})).toBe(false);
  });
});

describe('huellaDesdeBody', () => {
  it('toma monto de los nombres de campo más comunes, en orden de prioridad', () => {
    expect(huellaDesdeBody({ monto: 10 }).monto).toBe(10);
    expect(huellaDesdeBody({ total: 20 }).monto).toBe(20);
    expect(huellaDesdeBody({ descuentoMonto: 30 }).monto).toBe(30);
    expect(huellaDesdeBody({ precioNuevo: 40 }).monto).toBe(40);
  });

  it('body sin esos campos: huella vacía (null), no bloquea nada', () => {
    expect(huellaDesdeBody({ otraCosa: 1 })).toEqual({ facturaId: null, clienteId: null, monto: null });
  });
});
