import {
  diaAnclado, cicloVigente, ciclosRecientes, ultimoCicloCerrado, estaCerrado,
} from './ciclo-facturacion.util';

describe('anclaje del día de corte', () => {
  it('un día que existe se respeta', () => {
    expect(diaAnclado(2026, 8, 5)).toBe(5);
  });

  it('un corte 31 en un mes de 30 se recorta a 30', () => {
    expect(diaAnclado(2026, 4, 31)).toBe(30);
  });

  it('un corte 31 en febrero se recorta a 28, y a 29 en bisiesto', () => {
    expect(diaAnclado(2026, 2, 31)).toBe(28);
    expect(diaAnclado(2028, 2, 31)).toBe(29);
  });

  it('un corte ausente o absurdo cae en 1, no revienta', () => {
    expect(diaAnclado(2026, 8, 0)).toBe(1);
    expect(diaAnclado(2026, 8, -3)).toBe(1);
    expect(diaAnclado(2026, 8, NaN)).toBe(1);
  });

  it('un corte mayor que cualquier mes se queda en el último día', () => {
    expect(diaAnclado(2026, 8, 99)).toBe(31);
  });
});

describe('ciclo vigente', () => {
  it('a mitad de ciclo va del corte de este mes al del siguiente', () => {
    expect(cicloVigente(5, '2026-08-20')).toEqual({ inicio: '2026-08-05', fin: '2026-09-05' });
  });

  it('el día del corte ABRE ciclo, no lo cierra', () => {
    expect(cicloVigente(5, '2026-08-05')).toEqual({ inicio: '2026-08-05', fin: '2026-09-05' });
  });

  it('el día anterior al corte todavía pertenece al ciclo del mes pasado', () => {
    expect(cicloVigente(5, '2026-08-04')).toEqual({ inicio: '2026-07-05', fin: '2026-08-05' });
  });

  it('cruza el fin de año hacia atrás', () => {
    expect(cicloVigente(15, '2027-01-10')).toEqual({ inicio: '2026-12-15', fin: '2027-01-15' });
  });

  it('cruza el fin de año hacia adelante', () => {
    expect(cicloVigente(15, '2026-12-20')).toEqual({ inicio: '2026-12-15', fin: '2027-01-15' });
  });
});

describe('corte 31 — el recorte es del mes, no permanente', () => {
  it('marzo cierra en el 30 de abril porque abril no tiene 31', () => {
    expect(cicloVigente(31, '2026-04-10')).toEqual({ inicio: '2026-03-31', fin: '2026-04-30' });
  });

  it('y en mayo vuelve a 31: el corte no se degrada', () => {
    expect(cicloVigente(31, '2026-05-15')).toEqual({ inicio: '2026-04-30', fin: '2026-05-31' });
    expect(cicloVigente(31, '2026-06-15')).toEqual({ inicio: '2026-05-31', fin: '2026-06-30' });
  });

  it('febrero no arrastra su recorte a marzo', () => {
    expect(cicloVigente(31, '2026-03-05')).toEqual({ inicio: '2026-02-28', fin: '2026-03-31' });
  });
});

describe('ciclos recientes', () => {
  it('devuelve del vigente hacia atrás, sin huecos ni solapes', () => {
    const c = ciclosRecientes(5, 3, '2026-09-01');
    expect(c).toEqual([
      { inicio: '2026-08-05', fin: '2026-09-05' },
      { inicio: '2026-07-05', fin: '2026-08-05' },
      { inicio: '2026-06-05', fin: '2026-07-05' },
    ]);
  });

  it('el fin de uno es el inicio del siguiente: ningún e-CF cae en dos ciclos', () => {
    const c = ciclosRecientes(31, 6, '2026-06-15');
    for (let i = 1; i < c.length; i++) {
      expect(c[i].fin).toBe(c[i - 1].inicio);
    }
  });

  it('pedir 0 o menos devuelve al menos el vigente', () => {
    expect(ciclosRecientes(5, 0, '2026-09-01')).toHaveLength(1);
  });
});

describe('qué se puede cobrar', () => {
  it('el último cerrado es el anterior al vigente', () => {
    expect(ultimoCicloCerrado(5, '2026-09-01')).toEqual({ inicio: '2026-07-05', fin: '2026-08-05' });
  });

  it('el ciclo vigente NO está cerrado — todavía puede sumar e-CF', () => {
    expect(estaCerrado(cicloVigente(5, '2026-09-01'), '2026-09-01')).toBe(false);
  });

  it('un ciclo cierra el día de su fin, que ya es del siguiente', () => {
    const ciclo = { inicio: '2026-08-05', fin: '2026-09-05' };
    expect(estaCerrado(ciclo, '2026-09-04')).toBe(false);
    expect(estaCerrado(ciclo, '2026-09-05')).toBe(true);
  });
});

describe('el caso real que motivó la regla', () => {
  // Empresa 44 (Ventas Populares R&M), corte día 5. Medida por calendario daba
  // 5.736 e-CF en julio; por su ciclo real, 5.699. Con excedente de por medio
  // son dos cargos distintos.
  it('el ciclo de julio de la empresa 44 va del 5 de julio al 5 de agosto', () => {
    expect(cicloVigente(5, '2026-07-20')).toEqual({ inicio: '2026-07-05', fin: '2026-08-05' });
  });

  it('el 1 de septiembre esa empresa sigue dentro del ciclo abierto el 5 de agosto', () => {
    expect(cicloVigente(5, '2026-09-01')).toEqual({ inicio: '2026-08-05', fin: '2026-09-05' });
  });
});
