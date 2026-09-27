import { validarNCF } from './ncf.validator';

describe('validarNCF', () => {
  it('e-NCF real de producción (E320000006814) es válido', () => {
    expect(validarNCF('E320000006814')).toBe(true);
  });

  it('NCF físico válido (B0100000001)', () => {
    expect(validarNCF('B0100000001')).toBe(true);
  });

  it('normaliza minúsculas antes de validar', () => {
    expect(validarNCF('e320000006814')).toBe(true);
    expect(validarNCF('b0100000001')).toBe(true);
  });

  it('rechaza largo incorrecto', () => {
    expect(validarNCF('E32000000681')).toBe(false);  // 12
    expect(validarNCF('E3200000068140')).toBe(false); // 14
    expect(validarNCF('B010000000')).toBe(false);     // 10
    expect(validarNCF('B01000000012')).toBe(false);   // 12
  });

  it('rechaza letra distinta de B/E aunque el largo sea correcto', () => {
    expect(validarNCF('A0100000001')).toBe(false);
    expect(validarNCF('Q310000000001')).toBe(false);
  });

  it('rechaza caracteres no numéricos en la secuencia', () => {
    expect(validarNCF('B010000000X')).toBe(false);
    expect(validarNCF('E31000000000X')).toBe(false);
  });

  it('rechaza texto libre', () => {
    expect(validarNCF('REFERENCIA INTERNA')).toBe(false);
  });

  it('vacío: false (la obligatoriedad la decide @IsOptional/@IsNotEmpty del DTO, no este validador)', () => {
    expect(validarNCF('')).toBe(false);
  });
});
