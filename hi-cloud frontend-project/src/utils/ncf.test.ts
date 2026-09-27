import { describe, it, expect } from 'vitest';
import { normalizarNcf, esNcfCompleto, errorNcf, reglaFormatoNcf } from './ncf';

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

  it('e-NCF real de producción (E320000006814) es válido', () => expect(esNcfCompleto('E320000006814')).toBe(true));
  it('NCF físico real (B0100000001) es válido', () => expect(esNcfCompleto('B0100000001')).toBe(true));

  it('rechaza letra distinta de B/E aunque el largo sea correcto (11)', () => expect(esNcfCompleto('A0100000001')).toBe(false));
  it('rechaza letra distinta de B/E aunque el largo sea correcto (13)', () => expect(esNcfCompleto('Q310000000001')).toBe(false));
  it('rechaza "B" con 12 dígitos (largo de e-NCF, letra de físico)', () => expect(esNcfCompleto('B310000000001')).toBe(false));
  it('rechaza "E" con 10 dígitos (largo de físico, letra de e-NCF)', () => expect(esNcfCompleto('E0100000001')).toBe(false));
});

describe('errorNcf', () => {
  it('vacío: null — la obligatoriedad la decide el "required" de cada formulario, no este validador', () => {
    expect(errorNcf('')).toBeNull();
    expect(errorNcf(undefined)).toBeNull();
    expect(errorNcf(null)).toBeNull();
  });
  it('e-NCF válido: null', () => expect(errorNcf('E320000006814')).toBeNull());
  it('NCF físico válido: null', () => expect(errorNcf('B0100000001')).toBeNull());
  it('minúscula válida (se normaliza antes de validar): null', () => expect(errorNcf('e320000006814')).toBeNull());
  it('largo incorrecto: mensaje de error', () => expect(errorNcf('E3200000068')).toMatch(/inválido/i));
  it('letra distinta de B/E: mensaje de error', () => expect(errorNcf('A0100000001')).toMatch(/inválido/i));
});

describe('reglaFormatoNcf (regla de Form de AntD)', () => {
  it('resuelve para un NCF válido', async () => {
    await expect(reglaFormatoNcf.validator(null, 'E320000006814')).resolves.toBeUndefined();
  });
  it('resuelve para vacío (no es su responsabilidad exigir el campo)', async () => {
    await expect(reglaFormatoNcf.validator(null, '')).resolves.toBeUndefined();
  });
  it('rechaza un NCF con formato inválido', async () => {
    await expect(reglaFormatoNcf.validator(null, 'FACTURA INTERNA')).rejects.toThrow(/inválido/i);
  });
});
