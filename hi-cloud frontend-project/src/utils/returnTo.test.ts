import { describe, it, expect, beforeEach } from 'vitest';
import { esRutaInternaSegura, guardarReturnTo, consumirReturnTo } from './returnTo';

describe('esRutaInternaSegura', () => {
  it('acepta rutas internas normales', () => {
    expect(esRutaInternaSegura('/facturas/nueva')).toBe(true);
    expect(esRutaInternaSegura('/facturas?desde=2026-01-01')).toBe(true);
  });

  it('rechaza protocol-relative URLs (//host) — el navegador las trata como otro origen', () => {
    expect(esRutaInternaSegura('//evil.com')).toBe(false);
    expect(esRutaInternaSegura('//evil.com/phishing')).toBe(false);
  });

  it('rechaza URLs absolutas y rutas sin "/" inicial', () => {
    expect(esRutaInternaSegura('https://evil.com')).toBe(false);
    expect(esRutaInternaSegura('evil.com')).toBe(false);
    expect(esRutaInternaSegura('')).toBe(false);
  });

  it('rechaza null/undefined', () => {
    expect(esRutaInternaSegura(null)).toBe(false);
    expect(esRutaInternaSegura(undefined)).toBe(false);
  });
});

describe('guardarReturnTo / consumirReturnTo', () => {
  beforeEach(() => { sessionStorage.clear(); });

  it('guarda y consume una ruta interna válida — una sola vez', () => {
    guardarReturnTo('/facturas/nueva');
    expect(consumirReturnTo()).toBe('/facturas/nueva');
    expect(consumirReturnTo()).toBeNull(); // ya se consumió
  });

  it('nunca guarda una ruta insegura (//host) — consumirReturnTo da null', () => {
    guardarReturnTo('//evil.com');
    expect(consumirReturnTo()).toBeNull();
  });

  it('sin nada guardado, consumirReturnTo da null', () => {
    expect(consumirReturnTo()).toBeNull();
  });
});
