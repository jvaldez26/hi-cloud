import { calcularPreviewPago, calcularNuevaFecha, fechaDeVencimiento } from './preview-pago.util';

const base = {
  precioMensual:    1500,
  venceSuscripcion: '2026-08-31',
  diaCorte:         31,
  modalidad:        'mensual',
  hoy:              '2026-08-20',
};

describe('períodos cubiertos', () => {
  it('un pago exacto cubre un período', () => {
    expect(calcularPreviewPago({ ...base, monto: 1500 }).periodos).toBe(1);
  });

  it('tres meses de golpe cubren tres períodos', () => {
    expect(calcularPreviewPago({ ...base, monto: 4500 }).periodos).toBe(3);
  });

  it('lo que sobra de un período no cuenta: 2 meses y medio son 2', () => {
    const p = calcularPreviewPago({ ...base, monto: 3750 });
    expect(p.periodos).toBe(2);
    expect(p.nuevaFecha).toBe('2026-10-31');
  });
});

describe('pago parcial — queda como abono', () => {
  it('no extiende nada y dice cuánto falta', () => {
    const p = calcularPreviewPago({ ...base, monto: 1000 });
    expect(p).toMatchObject({ periodos: 0, nuevaFecha: null, faltante: 500, enPasado: false });
  });

  it('el faltante no arrastra basura de coma flotante', () => {
    expect(calcularPreviewPago({ ...base, monto: 1499.99 }).faltante).toBe(0.01);
  });

  it('un pago de 0 pide el período entero', () => {
    expect(calcularPreviewPago({ ...base, monto: 0 }).faltante).toBe(1500);
  });
});

describe('modalidad anual', () => {
  it('el período son 12 meses: 1500/mes son 18.000 al año', () => {
    const p = calcularPreviewPago({ ...base, modalidad: 'anual', monto: 18000 });
    expect(p).toMatchObject({ periodos: 1, precioPorPeriodo: 18000, nuevaFecha: '2027-08-31' });
  });

  it('11 meses de plata no compran un año', () => {
    const p = calcularPreviewPago({ ...base, modalidad: 'anual', monto: 16500 });
    expect(p).toMatchObject({ periodos: 0, faltante: 1500 });
  });

  it('dos años saltan dos años', () => {
    expect(calcularPreviewPago({ ...base, modalidad: 'anual', monto: 36000 }).nuevaFecha)
      .toBe('2028-08-31');
  });
});

describe('día de corte 31 contra meses de 30 y contra febrero', () => {
  it('de marzo a abril el corte 31 se recorta a 30', () => {
    expect(calcularPreviewPago({
      ...base, venceSuscripcion: '2026-03-31', monto: 1500,
    }).nuevaFecha).toBe('2026-04-30');
  });

  it('el ancla no se degrada: de abril 30 con corte 31 se vuelve a 31 en mayo', () => {
    expect(calcularPreviewPago({
      ...base, venceSuscripcion: '2026-04-30', monto: 1500,
    }).nuevaFecha).toBe('2026-05-31');
  });

  it('febrero de año normal recorta a 28', () => {
    expect(calcularPreviewPago({
      ...base, venceSuscripcion: '2027-01-31', monto: 1500, hoy: '2027-01-20',
    }).nuevaFecha).toBe('2027-02-28');
  });

  it('febrero bisiesto recorta a 29', () => {
    expect(calcularPreviewPago({
      ...base, venceSuscripcion: '2028-01-31', monto: 1500, hoy: '2028-01-20',
    }).nuevaFecha).toBe('2028-02-29');
  });

  it('un corte 15 no lo toca ningún mes', () => {
    expect(calcularPreviewPago({
      ...base, venceSuscripcion: '2026-01-15', diaCorte: 15, monto: 1500, hoy: '2026-01-10',
    }).nuevaFecha).toBe('2026-02-15');
  });

  it('cruza el año sin perderse', () => {
    expect(calcularPreviewPago({
      ...base, venceSuscripcion: '2026-11-30', diaCorte: 30, monto: 4500, hoy: '2026-11-20',
    }).nuevaFecha).toBe('2027-02-28');
  });
});

describe('sigue vencida después de pagar', () => {
  it('un mes no alcanza cuando debe cinco', () => {
    const p = calcularPreviewPago({
      ...base, venceSuscripcion: '2026-03-31', monto: 1500, hoy: '2026-08-20',
    });
    expect(p).toMatchObject({ periodos: 1, nuevaFecha: '2026-04-30', enPasado: true });
  });

  it('vencer HOY no es estar vencida', () => {
    const p = calcularPreviewPago({
      ...base, venceSuscripcion: '2026-07-31', monto: 1500, hoy: '2026-08-31',
    });
    expect(p.nuevaFecha).toBe('2026-08-31');
    expect(p.enPasado).toBe(false);
  });
});

describe('plan sin precio', () => {
  it('no inventa un faltante negativo', () => {
    const p = calcularPreviewPago({ ...base, precioMensual: 0, monto: 1500 });
    expect(p).toMatchObject({ sinPrecio: true, periodos: 0, faltante: 0, nuevaFecha: null });
  });

  it('un precio no numérico también es "sin precio"', () => {
    const p = calcularPreviewPago({ ...base, precioMensual: NaN, monto: 1500 });
    expect(p.sinPrecio).toBe(true);
  });
});

describe('fechaDeVencimiento', () => {
  it('recorta la hora pegada a una cadena', () => {
    expect(fechaDeVencimiento('2026-08-31T00:00:00.000Z')).toBe('2026-08-31');
  });

  it('conserva el día del Date que devuelve pg (proceso en UTC)', () => {
    expect(fechaDeVencimiento(new Date(Date.UTC(2026, 7, 31)))).toBe('2026-08-31');
  });
});

describe('calcularNuevaFecha — el frontend calculaba esto mismo por su cuenta', () => {
  it('coincide con la fórmula que se borró de CobrosPage', () => {
    // Réplica literal de la que vivía en el frontend, para dejar por escrito
    // que se retiró un duplicado y no se cambió la regla.
    const previa = (vence: string, diaCorte: number, periodos: number, modalidad: string) => {
      const [y, m] = vence.slice(0, 7).split('-').map(Number);
      let ny = y, nm = m;
      if (modalidad === 'anual') { ny += periodos; }
      else { nm += periodos; while (nm > 12) { nm -= 12; ny += 1; } }
      const ultimoDia = new Date(ny, nm, 0).getDate();
      const nd = Math.min(diaCorte, ultimoDia);
      return `${ny}-${String(nm).padStart(2, '0')}-${String(nd).padStart(2, '0')}`;
    };
    for (const vence of ['2026-01-31', '2026-04-30', '2026-02-28', '2026-12-01']) {
      for (const diaCorte of [1, 15, 28, 30, 31]) {
        for (const periodos of [1, 2, 6, 13]) {
          for (const modalidad of ['mensual', 'anual']) {
            expect(calcularNuevaFecha(vence, diaCorte, periodos, modalidad))
              .toBe(previa(vence, diaCorte, periodos, modalidad));
          }
        }
      }
    }
  });
});
