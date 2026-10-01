import { describe, it, expect } from 'vitest';
import { calcularEsAdmin } from './calcularEsAdmin';

describe('calcularEsAdmin', () => {
  it('usa el rol en la empresa activa, no el rol global — caso real: admin en la empresa, contador globalmente', () => {
    expect(calcularEsAdmin('admin', 'contador')).toBe(true);
  });

  it('bloquea si el rol en la empresa activa NO es admin, aunque el global sí lo sea', () => {
    expect(calcularEsAdmin('contador', 'admin')).toBe(false);
  });

  it('cae al rol global solo cuando no hay rol de empresa activa (defensivo)', () => {
    expect(calcularEsAdmin(null, 'admin')).toBe(true);
    expect(calcularEsAdmin(undefined, 'admin')).toBe(true);
    expect(calcularEsAdmin(null, 'contador')).toBe(false);
  });

  it('sin ningún rol disponible, nunca admin', () => {
    expect(calcularEsAdmin(null, null)).toBe(false);
    expect(calcularEsAdmin(undefined, undefined)).toBe(false);
  });
});
