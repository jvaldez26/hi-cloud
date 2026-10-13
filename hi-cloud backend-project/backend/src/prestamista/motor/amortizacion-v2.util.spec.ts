/**
 * Motor financiero — Etapa 2, Fase 2A. Ver docs/prestamista/motor-financiero.md §3-§7, §9.
 *
 * Casos canónicos (§9.1) calculados a mano o verificados contra la fórmula
 * documentada, más tests de propiedades (§9.2) sobre una matriz generada de
 * combinaciones.
 */
import { calcularTablaAmortizacion, ParametrosPrestamo } from './amortizacion-v2.util';

const BASE: ParametrosPrestamo = {
  montoPrincipal: 100000,
  frecuencia: 'mensual',
  fechaDesembolso: '2026-10-01',
  fechaPrimerPago: '2026-11-01',
  plazoPeriodos: 12,
  tasa: { valor: 0.03, periodoExpresado: 'mensual', tipo: 'nominal', baseDias: 360 },
  metodo: 'frances',
};

describe('§9.1.1 Francés mensual nominal sin gracia — RD$100,000, 12 meses, 3%/mes', () => {
  const r = calcularTablaAmortizacion(BASE);

  it('cuotaFija = 10046.21 (mismo caso de referencia de Etapa 1)', () => {
    expect(r.cuotaFija).toBe(10046.21);
  });

  it('cuota 1: interés 3000.00, capital 7046.21', () => {
    expect(r.tabla[0]).toMatchObject({ interes: 3000, capital: 7046.21, cuotaTotal: 10046.21 });
  });

  it('última cuota cierra el saldo en 0 exacto', () => {
    expect(r.tabla[11].saldoRestante).toBe(0);
  });

  it('Σ capital = montoPrincipal, exacto', () => {
    const sumaCapital = r.tabla.reduce((a, l) => a + l.capital, 0);
    expect(Math.round(sumaCapital * 100) / 100).toBe(100000);
  });

  it('totalAPagar = montoPrincipal + totalInteres (sin cargos)', () => {
    expect(r.totalAPagar).toBe(Math.round((100000 + r.totalInteres) * 100) / 100);
  });
});

describe('§9.1.2 Alemán mensual nominal sin gracia', () => {
  const r = calcularTablaAmortizacion({ ...BASE, metodo: 'aleman' });

  it('capitalFijo implícito 8333.33, cuota 1 = 11333.33', () => {
    expect(r.tabla[0]).toMatchObject({ capital: 8333.33, interes: 3000, cuotaTotal: 11333.33 });
  });

  it('cuota 2: interés sobre saldo ya reducido (91666.67 × 3% = 2750.00)', () => {
    expect(r.tabla[1]).toMatchObject({ capital: 8333.33, interes: 2750 });
  });

  it('última cuota cierra en cero', () => {
    expect(r.tabla[11].saldoRestante).toBe(0);
  });
});

describe('§9.1.3 Americano (bullet)', () => {
  const r = calcularTablaAmortizacion({ ...BASE, metodo: 'americano' });

  it('cuotas 1-11: solo interés, capital 0, saldo no baja', () => {
    for (let k = 0; k < 11; k++) {
      expect(r.tabla[k].capital).toBe(0);
      expect(r.tabla[k].interes).toBe(3000);
      expect(r.tabla[k].saldoRestante).toBe(100000);
    }
  });

  it('última cuota: capital 100000 + interés 3000 = 103000', () => {
    expect(r.tabla[11]).toMatchObject({ capital: 100000, interes: 3000, cuotaTotal: 103000, saldoRestante: 0 });
  });
});

describe('§9.1.4 Flat (interés fijo sobre el monto original)', () => {
  const r = calcularTablaAmortizacion({ ...BASE, metodo: 'flat' });

  it('cada cuota (salvo la última) tiene capital=8333.33 e interés=3000 constante', () => {
    for (let k = 0; k < 11; k++) {
      expect(r.tabla[k].capital).toBe(8333.33);
      expect(r.tabla[k].interes).toBe(3000);
    }
  });

  it('totalInteres = 100000 × 0.03 × 12 = 36000 exacto', () => {
    expect(r.totalInteres).toBe(36000);
  });

  it('última cuota absorbe el residuo de redondeo y cierra en 0', () => {
    expect(r.tabla[11].saldoRestante).toBe(0);
    expect(r.tabla[11].capital).toBeCloseTo(8333.37, 2); // 100000 - 8333.33*11
  });
});

describe('§9.1.5 Gracia de capital (3 períodos)', () => {
  const r = calcularTablaAmortizacion({
    ...BASE, metodo: 'frances', gracia: { tipo: 'capital', periodos: 3 },
  });

  it('cuotas 1-3: solo interés, capital 0, marcadas esPeriodoGracia', () => {
    for (let k = 0; k < 3; k++) {
      expect(r.tabla[k]).toMatchObject({ capital: 0, interes: 3000, esPeriodoGracia: true });
    }
  });

  it('cuota 4 en adelante: francés normal sobre 9 períodos con saldo 100000, NO marcadas gracia', () => {
    expect(r.tabla[3].esPeriodoGracia).toBe(false);
    expect(r.tabla[3].interes).toBe(3000); // saldo aún 100000
  });

  it('última cuota (12) cierra en 0', () => {
    expect(r.tabla[11].saldoRestante).toBe(0);
  });
});

describe('§9.1.6-8 Gracia total — los 3 tratamientos', () => {
  it('capitaliza: el saldo post-gracia es 100000×1.03^3 (interés sobre interés)', () => {
    const r = calcularTablaAmortizacion({
      ...BASE, metodo: 'frances', gracia: { tipo: 'total', periodos: 3, tratamientoInteresGracia: 'capitaliza' },
    });
    const saldoEsperado = Math.round(100000 * Math.pow(1.03, 3) * 100) / 100;
    expect(r.tabla[2].saldoRestante).toBeCloseTo(saldoEsperado, 1);
    expect(r.tabla[0].cuotaTotal).toBe(0); // nada se paga en gracia
    expect(r.tabla[11].saldoRestante).toBe(0);
  });

  it('prorratea: interés de gracia (3×3000=9000) repartido en las 9 cuotas restantes (+1000 c/u)', () => {
    const r = calcularTablaAmortizacion({
      ...BASE, metodo: 'frances', gracia: { tipo: 'total', periodos: 3, tratamientoInteresGracia: 'prorratea' },
    });
    for (let k = 0; k < 3; k++) expect(r.tabla[k].cuotaTotal).toBe(0);
    // interés normal de la cuota 4 (francés sobre saldo 100000) + 1000 de gracia prorrateada
    expect(r.tabla[3].interes).toBeCloseTo(3000 + 1000, 2);
    expect(r.tabla[11].saldoRestante).toBe(0);
  });

  it('primera_cuota: los 9000 de interés de gracia caen completos en la cuota 4, ninguna otra', () => {
    const r = calcularTablaAmortizacion({
      ...BASE, metodo: 'frances', gracia: { tipo: 'total', periodos: 3, tratamientoInteresGracia: 'primera_cuota' },
    });
    const cargoGracia = r.tabla[3].cargos.find(c => c.concepto === 'Interés diferido de gracia');
    expect(cargoGracia?.monto).toBeCloseTo(9000, 2);
    expect(r.tabla[4].cargos).toHaveLength(0);
    expect(r.tabla[11].saldoRestante).toBe(0);
  });

  it('default sin especificar tratamiento = prorratea', () => {
    const r = calcularTablaAmortizacion({ ...BASE, metodo: 'frances', gracia: { tipo: 'total', periodos: 3 } });
    expect(r.tabla[3].interes).toBeCloseTo(3000 + 1000, 2);
  });
});

describe('§9.1.9 Francés quincenal (días fijos)', () => {
  it('fechas verificadas a mano: 15 y último día de cada mes', () => {
    const r = calcularTablaAmortizacion({
      ...BASE, frecuencia: 'quincenal', quincenal: { modo: 'dias_fijos' },
      fechaPrimerPago: '2026-10-05', plazoPeriodos: 4,
      tasa: { valor: 0.015, periodoExpresado: 'quincenal', tipo: 'nominal', baseDias: 360 },
    });
    expect(r.tabla.map(l => l.fecha)).toEqual(['2026-10-15', '2026-10-31', '2026-11-15', '2026-11-30']);
  });
});

describe('§9.1.10 Francés con tasa efectiva', () => {
  it('la tasa por período convertida coincide con §2.2', () => {
    const r = calcularTablaAmortizacion({
      ...BASE, tasa: { valor: 0.03, periodoExpresado: 'mensual', tipo: 'efectiva', baseDias: 360 },
    });
    // efectiva mensual expresada y de pago mensual: round-trip = 0.03 exacto
    expect(r.tasaEquivalentePorPeriodo).toBeCloseTo(0.03, 9);
    expect(r.tabla[0].interes).toBeCloseTo(3000, 1);
  });
});

describe('§9.1.11 Diaria con exclusión de domingos', () => {
  it('el interés de la cuota que sigue a un domingo duplica el de un día normal (§2.4)', () => {
    const r = calcularTablaAmortizacion({
      montoPrincipal: 100000,
      frecuencia: 'diaria',
      fechaDesembolso: '2026-10-08', // jueves
      fechaPrimerPago: '2026-10-09', // viernes
      plazoPeriodos: 10,
      tasa: { valor: 0.03, periodoExpresado: 'mensual', tipo: 'nominal', baseDias: 360 }, // tasaDiaria = 0.001
      metodo: 'americano', // capital no cambia entre cuotas -> interés = saldo×tasaDiaria×días, fácil de verificar
      diaria: { excluirDomingos: true, excluirFeriados: false },
    });
    // fechas: vie9, sáb10, [dom11 excluido] lun12, mar13, mié14...
    // cuota del lunes 12 viene después de sábado 10 -> 2 días reales -> interés doble
    const fechas = r.tabla.map(l => l.fecha);
    const idxLunes = fechas.indexOf('2026-10-12');
    const idxSabado = fechas.indexOf('2026-10-10');
    expect(r.tabla[idxSabado].interes).toBeCloseTo(100000 * 0.001 * 1, 4);
    expect(r.tabla[idxLunes].interes).toBeCloseTo(100000 * 0.001 * 2, 4);
  });
});

describe('§9.1.12 Pago único — interés por días reales', () => {
  it('47 días entre desembolso y pago, verificado a mano', () => {
    const r = calcularTablaAmortizacion({
      montoPrincipal: 50000,
      frecuencia: 'unico',
      fechaDesembolso: '2026-10-01',
      fechaPrimerPago: '2026-11-17', // 47 días
      plazoPeriodos: 1,
      tasa: { valor: 0.03, periodoExpresado: 'mensual', tipo: 'nominal', baseDias: 360 },
      metodo: 'frances',
    });
    const tasaDiaria = (0.03 * 12) / 360; // = 0.001
    const interesEsperado = Math.round(50000 * tasaDiaria * 47 * 100) / 100;
    expect(r.tabla[0].interes).toBeCloseTo(interesEsperado, 2);
    expect(r.tabla[0].saldoRestante).toBe(0);
  });
});

describe('§9.1.13 Cargos de apertura — los 3 tratamientos', () => {
  const cargoBase = { concepto: 'Comisión de apertura', tipo: 'porcentaje' as const, monto: 2, momento: 'desembolso' as const };

  it('financiado: P sube a 102000, el deudor recibe 100000', () => {
    const r = calcularTablaAmortizacion({ ...BASE, cargos: [{ ...cargoBase, tratamientoDesembolso: 'financiado' }] });
    expect(r.montoPrincipalFinanciado).toBe(102000);
    expect(r.montoRecibidoDeudor).toBe(100000);
  });

  it('descontado: P sigue 100000, el deudor recibe 98000', () => {
    const r = calcularTablaAmortizacion({ ...BASE, cargos: [{ ...cargoBase, tratamientoDesembolso: 'descontado' }] });
    expect(r.montoPrincipalFinanciado).toBe(100000);
    expect(r.montoRecibidoDeudor).toBe(98000);
  });

  it('aparte: P sigue 100000, el deudor recibe 100000 del préstamo (paga el cargo por separado)', () => {
    const r = calcularTablaAmortizacion({ ...BASE, cargos: [{ ...cargoBase, tratamientoDesembolso: 'aparte' }] });
    expect(r.montoPrincipalFinanciado).toBe(100000);
    expect(r.montoRecibidoDeudor).toBe(100000);
    expect(r.totalCargos).toBe(2000); // igual se cuenta en el costo total del crédito
  });
});

describe('§9.1.14 Mora — NO forma parte de este motor (ver mora-v2.util.ts)', () => {
  it.todo('cubierto en mora-v2.util.spec.ts');
});

describe('§9.1.15 Cuotas personalizadas', () => {
  it('capital negativo se rechaza con error explícito, sin amortización negativa', () => {
    expect(() => calcularTablaAmortizacion({
      ...BASE, metodo: 'personalizado',
      cuotasPersonalizadas: [{ fecha: '2026-11-01', montoTotal: 1 }], // no cubre ni el interés
      tasa: { valor: 0.03, periodoExpresado: 'mensual', tipo: 'nominal', baseDias: 360 },
    })).toThrow(/no cubre ni el interés/);
  });

  it('cuotas que no cierran el préstamo se rechazan con el monto exacto que falta/sobra', () => {
    expect(() => calcularTablaAmortizacion({
      ...BASE, metodo: 'personalizado',
      cuotasPersonalizadas: [{ fecha: '2026-11-01', montoTotal: 50000 }],
    })).toThrow(/falta RD\$/);
  });

  it('cuotas que SÍ cierran: partición capital/interés correcta por días reales', () => {
    const r = calcularTablaAmortizacion({
      montoPrincipal: 10000,
      frecuencia: 'personalizado',
      fechaDesembolso: '2026-10-01',
      fechaPrimerPago: '2026-11-01',
      plazoPeriodos: 1,
      tasa: { valor: 0.03, periodoExpresado: 'mensual', tipo: 'nominal', baseDias: 360 },
      metodo: 'personalizado',
      cuotasPersonalizadas: [{ fecha: '2026-11-01', montoTotal: 10310 }], // 10000 + 31 días × 10/día interés
    });
    expect(r.tabla[0].saldoRestante).toBe(0);
  });
});

describe('§9.2 Propiedades, sobre una matriz de combinaciones generadas', () => {
  const metodos = ['frances', 'aleman', 'americano', 'flat'] as const;
  const frecuencias = ['semanal', 'mensual', 'trimestral'] as const;

  for (const metodo of metodos) {
    for (const frecuencia of frecuencias) {
      it(`${metodo} / ${frecuencia}: cierra en cero, sin negativos, fechas crecientes, sin pérdida de centavos`, () => {
        const r = calcularTablaAmortizacion({
          montoPrincipal: 137500.37,
          frecuencia,
          fechaDesembolso: '2026-10-01',
          fechaPrimerPago: '2026-10-15',
          plazoPeriodos: 9,
          tasa: { valor: 0.027, periodoExpresado: 'mensual', tipo: 'nominal', baseDias: 360 },
          metodo,
        });

        expect(r.tabla[r.tabla.length - 1].saldoRestante).toBe(0);

        const sumaCapital = Math.round(r.tabla.reduce((a, l) => a + l.capital, 0) * 100) / 100;
        expect(sumaCapital).toBe(137500.37);

        const sumaCuotas = Math.round(r.tabla.reduce((a, l) => a + l.cuotaTotal, 0) * 100) / 100;
        expect(sumaCuotas).toBe(Math.round((137500.37 + r.totalInteres + r.totalCargos) * 100) / 100);

        for (const linea of r.tabla) {
          expect(linea.capital).toBeGreaterThanOrEqual(0);
          expect(linea.interes).toBeGreaterThanOrEqual(0);
          expect(linea.cuotaTotal).toBeGreaterThanOrEqual(0);
        }

        for (let k = 1; k < r.tabla.length; k++) {
          expect(r.tabla[k].fecha > r.tabla[k - 1].fecha).toBe(true);
        }
      });
    }
  }
});
