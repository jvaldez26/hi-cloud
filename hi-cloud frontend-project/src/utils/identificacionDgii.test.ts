import { describe, it, expect } from 'vitest';
import { tipoIdentificacion, esRncOCedulaValido, soloDigitos } from './identificacionDgii';

describe('tipoIdentificacion', () => {
  it('9 dígitos es RNC', () => expect(tipoIdentificacion('402264482')).toBe('RNC'));
  it('11 dígitos es cédula', () => expect(tipoIdentificacion('40226448241')).toBe('Cédula'));
  it('reconoce la cédula con guiones, como viene de una copia', () =>
    expect(tipoIdentificacion('402-2644824-1')).toBe('Cédula'));
  it('10 dígitos no es ninguno — ni RNC ni cédula', () =>
    expect(tipoIdentificacion('4022644824')).toBeNull());
  it('vacío es null', () => expect(tipoIdentificacion('')).toBeNull());
  it('undefined es null', () => expect(tipoIdentificacion(undefined)).toBeNull());
});

describe('esRncOCedulaValido', () => {
  it('acepta RNC', () => expect(esRncOCedulaValido('131234567')).toBe(true));
  it('acepta cédula', () => expect(esRncOCedulaValido('00112345678')).toBe(true));
  it('rechaza incompleto', () => expect(esRncOCedulaValido('1312345')).toBe(false));
  it('rechaza vacío — quien decide si es obligatorio es el formulario', () =>
    expect(esRncOCedulaValido('')).toBe(false));
});

describe('soloDigitos', () => {
  it('quita guiones y espacios', () => expect(soloDigitos(' 402-2644 824-1 ')).toBe('40226448241'));
  it('quita letras', () => expect(soloDigitos('RNC 131234567')).toBe('131234567'));
});
