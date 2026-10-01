import { describe, it, expect } from 'vitest';
import { puedeActivarXlink } from './puedeActivarXlink';

describe('puedeActivarXlink', () => {
  it('admin en la empresa activa puede activar, aunque el rol global sea otro', () => {
    expect(puedeActivarXlink('admin', 'contador')).toBe(true);
  });

  it('contador en la empresa activa puede activar', () => {
    expect(puedeActivarXlink('contador', 'admin')).toBe(true);
  });

  it('bloquea roles distintos de admin/contador', () => {
    expect(puedeActivarXlink('vendedor', 'admin')).toBe(false);
    expect(puedeActivarXlink('viewer', 'admin')).toBe(false);
  });

  it('usa el rol en la empresa activa, no el global — caso real: vendedor en la empresa, admin globalmente', () => {
    expect(puedeActivarXlink('vendedor', 'admin')).toBe(false);
  });

  it('cae al rol global solo cuando no hay rol de empresa activa (defensivo)', () => {
    expect(puedeActivarXlink(null, 'admin')).toBe(true);
    expect(puedeActivarXlink(undefined, 'contador')).toBe(true);
    expect(puedeActivarXlink(null, 'vendedor')).toBe(false);
  });

  it('sin ningún rol disponible, nunca puede activar', () => {
    expect(puedeActivarXlink(null, null)).toBe(false);
    expect(puedeActivarXlink(undefined, undefined)).toBe(false);
  });
});
