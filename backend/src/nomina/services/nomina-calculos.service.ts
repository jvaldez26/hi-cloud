import { Injectable } from '@nestjs/common';
import { Empleado } from '../entities/empleado.entity';

// ── Tasas TSS vigentes — Ley 87-01 (actualizadas 2024) ──────────────────────
export const TASAS_TSS = {
  sfs:  { empleado: 0.0304, patronal: 0.0709 },
  afp:  { empleado: 0.0287, patronal: 0.0710 },
  srl:  { patronal: 0.0120 },
  totalEmpleado: 0.0591,   // SFS + AFP empleado
  totalPatronal: 0.1539,   // SFS + AFP + SRL patronal
};

// ── Tabla ISR anual vigente — DGII República Dominicana ─────────────────────
const TABLA_ISR = [
  { desde: 0,          hasta: 416_220.00,    tasa: 0.00, base: 0,          fijo: 0 },
  { desde: 416_220.01, hasta: 624_329.00,    tasa: 0.15, base: 416_220,    fijo: 0 },
  { desde: 624_329.01, hasta: 867_123.00,    tasa: 0.20, base: 624_329,    fijo: 31_216.20 },
  { desde: 867_123.01, hasta: Infinity,      tasa: 0.25, base: 867_123,    fijo: 79_776.60 },
];

export interface ResultadoCalculo {
  salarioBase:         number;
  diasTrabajados:      number;
  salarioBruto:        number;
  tssSfsEmpleado:      number;
  tssAfpEmpleado:      number;
  totalTSSEmpleado:    number;
  baseISR:             number;
  isr:                 number;
  otrasDeduciones:     number;
  totalDeducciones:    number;
  salarioNeto:         number;
  tssSfsPatronal:      number;
  tssAfpPatronal:      number;
  tssSrlPatronal:      number;
  totalTSSPatronal:    number;
  costoTotalEmpleado:  number;
}

@Injectable()
export class NominaCalculosService {

  calcularISRMensual(salarioBruto: number, tssEmpleado: number): number {
    const baseImponible = Math.max(0, salarioBruto - tssEmpleado);
    const anual = baseImponible * 12;

    const tramo = TABLA_ISR.find((t) => anual >= t.desde && anual <= t.hasta)!;
    if (tramo.tasa === 0) return 0;

    const isrAnual = tramo.fijo + (anual - tramo.base) * tramo.tasa;
    return Number((isrAnual / 12).toFixed(2));
  }

  calcularLinea(empleado: Empleado, diasTrabajados: number, diasPeriodo: number): ResultadoCalculo {
    const salarioBruto = Number(
      ((Number(empleado.salarioBase) * diasTrabajados) / diasPeriodo).toFixed(2),
    );

    const sfsEmpl = Number((salarioBruto * TASAS_TSS.sfs.empleado).toFixed(2));
    const afpEmpl = Number((salarioBruto * TASAS_TSS.afp.empleado).toFixed(2));
    const totalTSSEmpl = Number((sfsEmpl + afpEmpl).toFixed(2));

    const isr = this.calcularISRMensual(salarioBruto, totalTSSEmpl);

    const otrasDeduciones = Number(empleado.otrasDeduccionesFixed ?? 0);
    const totalDeducciones = Number((totalTSSEmpl + isr + otrasDeduciones).toFixed(2));
    const salarioNeto = Number((salarioBruto - totalDeducciones).toFixed(2));

    const sfsPat  = Number((salarioBruto * TASAS_TSS.sfs.patronal).toFixed(2));
    const afpPat  = Number((salarioBruto * TASAS_TSS.afp.patronal).toFixed(2));
    const srlPat  = Number((salarioBruto * TASAS_TSS.srl.patronal).toFixed(2));
    const totalTSSPat = Number((sfsPat + afpPat + srlPat).toFixed(2));
    const costoTotal  = Number((salarioBruto + totalTSSPat).toFixed(2));

    return {
      salarioBase:        Number(empleado.salarioBase),
      diasTrabajados,
      salarioBruto,
      tssSfsEmpleado:     sfsEmpl,
      tssAfpEmpleado:     afpEmpl,
      totalTSSEmpleado:   totalTSSEmpl,
      baseISR:            Number((salarioBruto - totalTSSEmpl).toFixed(2)),
      isr,
      otrasDeduciones,
      totalDeducciones,
      salarioNeto,
      tssSfsPatronal:     sfsPat,
      tssAfpPatronal:     afpPat,
      tssSrlPatronal:     srlPat,
      totalTSSPatronal:   totalTSSPat,
      costoTotalEmpleado: costoTotal,
    };
  }

  simular(salarioBase: number, diasTrabajados = 30, diasPeriodo = 30, otrasDeduciones = 0) {
    const emp = { salarioBase, otrasDeduccionesFixed: otrasDeduciones } as Empleado;
    const r = this.calcularLinea(emp, diasTrabajados, diasPeriodo);
    return {
      ...r,
      tasasAplicadas: {
        sfsEmpleado:  `${(TASAS_TSS.sfs.empleado * 100).toFixed(2)}%`,
        afpEmpleado:  `${(TASAS_TSS.afp.empleado * 100).toFixed(2)}%`,
        sfsPatronal:  `${(TASAS_TSS.sfs.patronal * 100).toFixed(2)}%`,
        afpPatronal:  `${(TASAS_TSS.afp.patronal * 100).toFixed(2)}%`,
        srlPatronal:  `${(TASAS_TSS.srl.patronal * 100).toFixed(2)}%`,
        totalEmpleado: `${(TASAS_TSS.totalEmpleado * 100).toFixed(2)}%`,
        totalPatronal: `${(TASAS_TSS.totalPatronal * 100).toFixed(2)}%`,
      },
    };
  }

  getTasas() {
    return {
      ley: 'Ley 87-01 Seguridad Social República Dominicana',
      vigente: '2024',
      tss: {
        empleado: {
          sfs: `${(TASAS_TSS.sfs.empleado * 100).toFixed(2)}%`,
          afp: `${(TASAS_TSS.afp.empleado * 100).toFixed(2)}%`,
          total: `${(TASAS_TSS.totalEmpleado * 100).toFixed(2)}%`,
        },
        patronal: {
          sfs: `${(TASAS_TSS.sfs.patronal * 100).toFixed(2)}%`,
          afp: `${(TASAS_TSS.afp.patronal * 100).toFixed(2)}%`,
          srl: `${(TASAS_TSS.srl.patronal * 100).toFixed(2)}%`,
          total: `${(TASAS_TSS.totalPatronal * 100).toFixed(2)}%`,
        },
      },
      isr: {
        ley: 'Ley 179-09 — Impuesto Sobre la Renta DGII',
        tabla: TABLA_ISR.map((t) => ({
          desde: t.desde,
          hasta: t.hasta === Infinity ? 'En adelante' : t.hasta,
          tasa: `${(t.tasa * 100).toFixed(0)}%`,
        })),
      },
    };
  }

  calcularPrestaciones(empleado: Empleado) {
    const hoy = new Date();
    const ingreso = new Date(empleado.fechaIngreso);
    const meses = (hoy.getFullYear() - ingreso.getFullYear()) * 12
      + (hoy.getMonth() - ingreso.getMonth());
    const anios = meses / 12;
    const salarioMensual = Number(empleado.salarioBase);
    const salarioDiario = salarioMensual / 30;

    // Cesantía (Código de Trabajo RD)
    let cesantia = 0;
    if (anios >= 0.25 && anios < 0.5)  cesantia = 6 * salarioDiario;
    else if (anios < 1)                 cesantia = 13 * salarioDiario;
    else if (anios < 2)                 cesantia = 21 * salarioDiario;
    else if (anios < 3)                 cesantia = 29 * salarioDiario;
    else if (anios < 4)                 cesantia = 37 * salarioDiario;
    else if (anios < 5)                 cesantia = 45 * salarioDiario;
    else                                cesantia = 45 * salarioDiario + (anios - 5) * 23 * salarioDiario;

    // Preaviso (Art. 76 Código de Trabajo)
    let preaviso = 0;
    if (anios >= 0.25 && anios < 1) preaviso = 7 * salarioDiario;
    else if (anios < 2)             preaviso = 14 * salarioDiario;
    else if (anios < 5)             preaviso = 28 * salarioDiario;
    else                            preaviso = 28 * salarioDiario;

    // Vacaciones (Art. 177 Código de Trabajo)
    const diasVacaciones = anios >= 5 ? 18 : 14;
    const vacaciones = diasVacaciones * salarioDiario;

    // Sueldo de Navidad (Art. 219 — 1 mes de salario)
    const sueldoNavidad = salarioMensual;

    return {
      empleado:      `${empleado.nombre} ${empleado.apellido}`,
      cedula:        empleado.cedula,
      fechaIngreso:  empleado.fechaIngreso,
      tiempoServicio: { meses, anios: Number(anios.toFixed(2)) },
      salarioMensual,
      salarioDiario:  Number(salarioDiario.toFixed(2)),
      prestaciones: {
        cesantia:      Number(cesantia.toFixed(2)),
        preaviso:      Number(preaviso.toFixed(2)),
        vacaciones:    Number(vacaciones.toFixed(2)),
        sueldoNavidad: Number(sueldoNavidad.toFixed(2)),
        total:         Number((cesantia + preaviso + vacaciones + sueldoNavidad).toFixed(2)),
      },
    };
  }
}
