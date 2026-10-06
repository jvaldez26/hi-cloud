import { describe, it, expect } from 'vitest';
import { labelIndustria } from './labelIndustria';

describe('labelIndustria — Directorio de HiCloud Xlink', () => {
  it('traduce un código del catálogo a su etiqueta legible', () => {
    expect(labelIndustria('servicios_prof')).toBe('Servicios Profesionales');
    expect(labelIndustria('taller_mecanico')).toBe('Taller Mecánico');
  });

  it('sin código, muestra un guion', () => {
    expect(labelIndustria(null)).toBe('—');
    expect(labelIndustria(undefined)).toBe('—');
    expect(labelIndustria('')).toBe('—');
  });

  it('un código sin entrada en el catálogo se capitaliza y pierde los guiones bajos, nunca crudo', () => {
    expect(labelIndustria('otro_sector_nuevo')).toBe('Otro Sector Nuevo');
  });
});
