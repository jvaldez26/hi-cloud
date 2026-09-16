import { describe, it, expect } from 'vitest';
import { normalizarNcf, esNcfCompleto } from './ncf';

describe('normalizarNcf', () => {
  it('pasa a mayúsculas', () => expect(normalizarNcf('e310000000001')).toBe('E310000000001'));
  it('quita espacios', () => expect(normalizarNcf(' b01 00000001 ')).toBe('B0100000001'));
});

describe('esNcfCompleto', () => {
  it('acepta NCF impreso de 11', () => expect(esNcfCompleto('B0100000001')).toBe(true));
  it('acepta e-NCF de 13', () => expect(esNcfCompleto('E310000000001')).toBe(true));
  it('acepta minúsculas', () => expect(esNcfCompleto('e310000000001')).toBe(true));
  it('rechaza incompleto', () => expect(esNcfCompleto('E31000')).toBe(false));
  it('rechaza 12 caracteres', () => expect(esNcfCompleto('E31000000000')).toBe(false));
  it('rechaza texto libre', () => expect(esNcfCompleto('FACTURA INTERNA')).toBe(false));
  it('rechaza vacío', () => expect(esNcfCompleto('')).toBe(false));
});
