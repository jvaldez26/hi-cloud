import { describe, it, expect } from 'vitest';
import { esTimeoutOReddCliente, interpretarConsultaTrasTimeout } from './emitirPosTimeout';

describe('esTimeoutOReddCliente', () => {
  it('timeout de axios (ECONNABORTED, sin .response) → true', () => {
    expect(esTimeoutOReddCliente({ code: 'ECONNABORTED', message: 'timeout of 20000ms exceeded' })).toBe(true);
  });

  it('red caída (ERR_NETWORK, sin .response) → true', () => {
    expect(esTimeoutOReddCliente({ code: 'ERR_NETWORK', message: 'Network Error' })).toBe(true);
  });

  it('mensaje con "timeout" sin código ni .response → true (fallback por mensaje)', () => {
    expect(esTimeoutOReddCliente({ message: 'timeout of 20000ms exceeded' })).toBe(true);
  });

  it('CUALQUIER error con .response (el servidor SÍ contestó) → false, aunque el mensaje diga "timeout"', () => {
    expect(esTimeoutOReddCliente({ response: { status: 422, data: {} }, message: 'timeout raro' })).toBe(false);
  });

  it('un rechazo de negocio normal (422, RNC requerido) → false', () => {
    expect(esTimeoutOReddCliente({ response: { status: 422, data: { message: 'RNC requerido' } } })).toBe(false);
  });

  it('el Error sintético de ecfEmitido:false (sin .response, mensaje de negocio) → false', () => {
    expect(esTimeoutOReddCliente(new Error('No se pudo emitir el comprobante fiscal'))).toBe(false);
  });
});

describe('interpretarConsultaTrasTimeout', () => {
  it('null (la consulta tampoco respondió) → sin_confirmar', () => {
    expect(interpretarConsultaTrasTimeout(null).tipo).toBe('sin_confirmar');
  });

  it('factura todavía en borrador (la petición original ni llegó a crear nada) → sin_confirmar', () => {
    expect(interpretarConsultaTrasTimeout({ estado: 'borrador' }).tipo).toBe('sin_confirmar');
  });

  it('factura emitida + e-CF aceptado → confirmada, mensaje de aceptado', () => {
    const r = interpretarConsultaTrasTimeout({ estado: 'emitida', ecf: { estadoDGII: 'aceptado' } });
    expect(r).toMatchObject({ tipo: 'confirmada', estadoEcf: 'aceptado' });
    expect(r.tipo === 'confirmada' && r.mensaje).toMatch(/aceptado/i);
  });

  it('factura pagada + e-CF todavía pendiente_envio → confirmada, mensaje de "procesando" (nunca rojo)', () => {
    const r = interpretarConsultaTrasTimeout({ estado: 'pagada', ecf: { estadoDGII: 'pendiente_envio' } });
    expect(r).toMatchObject({ tipo: 'confirmada', estadoEcf: 'pendiente_envio' });
    expect(r.tipo === 'confirmada' && r.mensaje).toMatch(/procesando/i);
  });

  it('factura emitida sin fila de e-CF todavía → confirmada como "procesando" (no revienta, no asume aceptado)', () => {
    const r = interpretarConsultaTrasTimeout({ estado: 'emitida', ecf: null });
    expect(r).toMatchObject({ tipo: 'confirmada', estadoEcf: 'pendiente_envio' });
  });
});
