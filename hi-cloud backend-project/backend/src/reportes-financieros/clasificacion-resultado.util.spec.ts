import { resolverClasificacionResultado, CuentaClasificable } from './clasificacion-resultado.util';

function cuenta(p: Partial<CuentaClasificable> & { id: number; codigo: string }): CuentaClasificable {
  return { cuentaPadreId: null, clasificacionResultado: null, ...p };
}

describe('resolverClasificacionResultado', () => {
  it('cuenta sin valor propio y sin madre → operacional (default)', () => {
    const catalogo = [cuenta({ id: 1, codigo: '4' })];
    expect(resolverClasificacionResultado(catalogo).get('4')).toBe('operacional');
  });

  it('cuenta con valor propio → usa el suyo, no mira la madre', () => {
    const catalogo = [
      cuenta({ id: 1, codigo: '4', clasificacionResultado: 'no_operacional' }),
      cuenta({ id: 2, codigo: '4.1', cuentaPadreId: 1, clasificacionResultado: 'operacional' }),
    ];
    expect(resolverClasificacionResultado(catalogo).get('4.1')).toBe('operacional');
  });

  it('hereda de la madre cuando la propia es null', () => {
    const catalogo = [
      cuenta({ id: 1, codigo: '4.2', clasificacionResultado: 'no_operacional' }),
      cuenta({ id: 2, codigo: '4.2.1', cuentaPadreId: 1 }),
      cuenta({ id: 3, codigo: '4.2.1.01', cuentaPadreId: 2 }),
    ];
    const r = resolverClasificacionResultado(catalogo);
    expect(r.get('4.2.1')).toBe('no_operacional');
    expect(r.get('4.2.1.01')).toBe('no_operacional'); // hereda de la abuela, dos niveles arriba
  });

  it('el caso real: marcar 6.1.3 "Gastos Financieros" no afecta a sus hermanas bajo 6.1', () => {
    const catalogo = [
      cuenta({ id: 1, codigo: '6.1' }), // Gastos Operacionales — sin marcar, default operacional
      cuenta({ id: 2, codigo: '6.1.2', cuentaPadreId: 1 }), // Gastos Generales — hereda de 6.1 → operacional
      cuenta({ id: 3, codigo: '6.1.2.01', cuentaPadreId: 2 }), // Alquiler
      cuenta({ id: 4, codigo: '6.1.3', cuentaPadreId: 1, clasificacionResultado: 'no_operacional' }), // Gastos Financieros
      cuenta({ id: 5, codigo: '6.1.3.01', cuentaPadreId: 4 }), // Intereses Bancarios
    ];
    const r = resolverClasificacionResultado(catalogo);
    expect(r.get('6.1.2.01')).toBe('operacional');    // Alquiler sigue operacional
    expect(r.get('6.1.3.01')).toBe('no_operacional'); // Intereses hereda de 6.1.3, no de 6.1
  });

  it('cuenta huérfana (madre no está en el catálogo) → operacional, no rompe', () => {
    const catalogo = [cuenta({ id: 1, codigo: '4.9', cuentaPadreId: 999 })];
    expect(resolverClasificacionResultado(catalogo).get('4.9')).toBe('operacional');
  });

  it('ciclo defensivo: nunca entra en loop infinito', () => {
    const catalogo = [
      cuenta({ id: 1, codigo: 'a', cuentaPadreId: 2 }),
      cuenta({ id: 2, codigo: 'b', cuentaPadreId: 1 }),
    ];
    expect(() => resolverClasificacionResultado(catalogo)).not.toThrow();
  });
});
