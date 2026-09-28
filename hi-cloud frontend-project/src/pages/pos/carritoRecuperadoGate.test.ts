import { describe, it, expect } from 'vitest';
import { requiereSupervisorPorPrecioModificado } from './carritoRecuperadoGate';

describe('requiereSupervisorPorPrecioModificado', () => {
  it('pide autorización si hay un ítem con precio modificado y NO hay sesión de supervisor activa', () => {
    const cart = [{ precioModificado: true }];
    expect(requiereSupervisorPorPrecioModificado(cart, false)).toBe(true);
  });

  it('no pide nada si hay sesión de supervisor activa, aunque haya precios modificados', () => {
    const cart = [{ precioModificado: true }];
    expect(requiereSupervisorPorPrecioModificado(cart, true)).toBe(false);
  });

  it('no pide nada si ningún ítem tiene precio modificado', () => {
    const cart = [{ precioModificado: false }, {}];
    expect(requiereSupervisorPorPrecioModificado(cart, false)).toBe(false);
  });

  it('carrito vacío: nunca pide nada', () => {
    expect(requiereSupervisorPorPrecioModificado([], false)).toBe(false);
  });

  it('basta con UN ítem modificado entre varios normales', () => {
    const cart = [{ precioModificado: false }, { precioModificado: true }, {}];
    expect(requiereSupervisorPorPrecioModificado(cart, false)).toBe(true);
  });
});
