export interface LineaAmortizacion {
  numeroCuota: number;
  fechaVencimiento: Date;
  capital: number;
  interes: number;
  cuotaTotal: number;
  saldoRestante: number;
}

export interface ResultadoAmortizacion {
  tabla: LineaAmortizacion[];
  cuotaFija: number;
  totalInteres: number;
  totalAPagar: number;
}

function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

function addMeses(fecha: Date, meses: number): Date {
  // Las fechas de cuota nacen de new Date('YYYY-MM-DD'), que es medianoche UTC,
  // y se guardan con .toISOString().split('T')[0]. Esa combinación es correcta y
  // NO debe "arreglarse" pasándola a hora de RD: medianoche UTC es el día
  // anterior a las 20:00 en Santo Domingo, así que convertirla restaría un día a
  // TODAS las cuotas. fechaHoyRD() es para "hoy", no para fechas ya dadas.
  const d = new Date(fecha);
  d.setMonth(d.getMonth() + meses);
  return d;
}

export function amortizacionFrancesa(
  principal: number,
  tasaMensualPct: number,
  plazoMeses: number,
  fechaPrimerPago: Date,
): ResultadoAmortizacion {
  const i = tasaMensualPct / 100;
  const n = plazoMeses;

  let cuotaFija: number;
  if (i === 0) {
    cuotaFija = r2(principal / n);
  } else {
    cuotaFija = r2(principal * (i * Math.pow(1 + i, n)) / (Math.pow(1 + i, n) - 1));
  }

  const tabla: LineaAmortizacion[] = [];
  let saldo = principal;
  let totalInteres = 0;

  for (let k = 1; k <= n; k++) {
    const interes = r2(saldo * i);
    let cap: number;
    let cuotaTotal: number;

    if (k === n) {
      cap = r2(saldo);
      cuotaTotal = r2(cap + interes);
      saldo = 0;
    } else {
      cap = r2(cuotaFija - interes);
      cuotaTotal = cuotaFija;
      saldo = r2(saldo - cap);
    }

    totalInteres = r2(totalInteres + interes);

    tabla.push({
      numeroCuota: k,
      fechaVencimiento: addMeses(fechaPrimerPago, k - 1),
      capital: cap,
      interes,
      cuotaTotal,
      saldoRestante: saldo,
    });
  }

  return {
    tabla,
    cuotaFija,
    totalInteres,
    totalAPagar: r2(principal + totalInteres),
  };
}

export function amortizacionAlemana(
  principal: number,
  tasaMensualPct: number,
  plazoMeses: number,
  fechaPrimerPago: Date,
): ResultadoAmortizacion {
  const i = tasaMensualPct / 100;
  const n = plazoMeses;
  const capitalFijo = r2(principal / n);

  const tabla: LineaAmortizacion[] = [];
  let saldo = principal;
  let totalInteres = 0;

  for (let k = 1; k <= n; k++) {
    const interes = r2(saldo * i);
    const cap = k === n ? r2(saldo) : capitalFijo;
    const cuotaTotal = r2(cap + interes);
    saldo = r2(saldo - cap);
    totalInteres = r2(totalInteres + interes);

    tabla.push({
      numeroCuota: k,
      fechaVencimiento: addMeses(fechaPrimerPago, k - 1),
      capital: cap,
      interes,
      cuotaTotal,
      saldoRestante: saldo,
    });
  }

  return {
    tabla,
    cuotaFija: 0,
    totalInteres,
    totalAPagar: r2(principal + totalInteres),
  };
}

export function calcularAmortizacion(
  metodo: 'frances' | 'aleman',
  principal: number,
  tasaMensualPct: number,
  plazoMeses: number,
  fechaPrimerPago: Date,
): ResultadoAmortizacion {
  return metodo === 'aleman'
    ? amortizacionAlemana(principal, tasaMensualPct, plazoMeses, fechaPrimerPago)
    : amortizacionFrancesa(principal, tasaMensualPct, plazoMeses, fechaPrimerPago);
}
