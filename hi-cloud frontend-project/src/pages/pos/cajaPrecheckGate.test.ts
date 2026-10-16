import { describe, it, expect } from 'vitest';
import { debeBloquearPorCajaPrecheck } from './cajaPrecheckGate';

/**
 * Incidente real (2026-10-16, empresa 44): este precheck SÍ bloqueaba el
 * cobro con un 'cerrada' local, sin que la petición real llegara nunca al
 * backend — 231 facturas emitidas ese mismo día (la caja realmente estaba
 * abierta) y cero rechazos en audit_logs lo prueban. Ahora NUNCA bloquea,
 * ni siquiera con 'cerrada': el backend (esCajaAbiertaVendedor) es la
 * única autoridad real, y es el que de verdad rechaza cuando no hay
 * ninguna caja — con un mensaje que el mismo manejador de errores ya
 * reconoce y muestra igual.
 */
describe('debeBloquearPorCajaPrecheck — el precheck local NUNCA bloquea el cobro', () => {
  it("'cerrada' (el caso real del incidente): no bloquea", () => {
    expect(debeBloquearPorCajaPrecheck('cerrada')).toBe(false);
  });

  it("'abierta': no bloquea", () => {
    expect(debeBloquearPorCajaPrecheck('abierta')).toBe(false);
  });

  it("'desconocida' (timeout/error de red): no bloquea", () => {
    expect(debeBloquearPorCajaPrecheck('desconocida')).toBe(false);
  });
});
