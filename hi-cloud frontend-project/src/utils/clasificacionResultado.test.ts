import { describe, it, expect } from 'vitest';
import { clasificacionHeredada, CuentaClasificable } from './clasificacionResultado';

describe('clasificacionHeredada', () => {
  it('sin padre → operacional', () => {
    expect(clasificacionHeredada(null, [])).toBe('operacional');
  });

  it('el padre tiene valor propio → lo usa directo', () => {
    const catalogo: CuentaClasificable[] = [{ id: 1, clasificacionResultado: 'no_operacional' }];
    expect(clasificacionHeredada(1, catalogo)).toBe('no_operacional');
  });

  it('el padre hereda de SU madre (sube dos niveles)', () => {
    const catalogo: CuentaClasificable[] = [
      { id: 1, clasificacionResultado: 'no_operacional' },
      { id: 2, cuentaPadreId: 1 },
    ];
    expect(clasificacionHeredada(2, catalogo)).toBe('no_operacional');
  });

  it('padre no encontrado en el catálogo → operacional, no explota', () => {
    expect(clasificacionHeredada(999, [])).toBe('operacional');
  });

  it('ciclo defensivo: nunca entra en loop infinito', () => {
    const catalogo: CuentaClasificable[] = [
      { id: 1, cuentaPadreId: 2 },
      { id: 2, cuentaPadreId: 1 },
    ];
    expect(() => clasificacionHeredada(1, catalogo)).not.toThrow();
  });
});
