/**
 * FIX 1 (2026-09-20) — "Resultado del ejercicio" y "Resultados acumulados"
 * en Balance General, más la línea "Diferencia por asientos descuadrados".
 *
 * El motor no tiene asiento de cierre de ejercicio: ingresos, costos y
 * gastos se acumulan en sus propias cuentas sin límite de fecha y nunca se
 * reflejaban en Patrimonio — la ecuación del balance no podía cuadrar desde
 * el primer año con actividad. Estas pruebas verifican la aritmética de las
 * líneas calculadas (no SQL crudo — eso lo cubre saldos-cuentas.service.spec.ts).
 */

import { ReportesFinancierosService } from './reportes-financieros.service';
import { SaldosCuentasService } from './saldos-cuentas.service';

type Fila = { codigo: string; nombre: string; tipo: string; naturaleza: string; nivel: string; total_debe: string; total_haber: string };

/**
 * DataSource falso que responde según el rango de fechas de cada llamada a
 * obtenerSaldos() (identificable por sus parámetros), y una tabla aparte
 * para obtenerAsientosDescuadrados(). Evita depender del orden de llamadas.
 */
function makeDataSource(opts: {
  filasPorRango: Map<string, Fila[]>; // clave: `${desde ?? ''}|${hasta ?? ''}`
  asientosDescuadrados?: { id: number; fecha: string; tipoOrigen: string; referenciaFolio: string; totalDebe: string; totalHaber: string }[];
}) {
  return {
    query: (sql: string, params: unknown[] = []) => {
      if (sql.includes('FROM asientos_contables') && !sql.includes('cuentas_contables')) {
        return Promise.resolve(opts.asientosDescuadrados ?? []);
      }
      // obtenerSaldos: params = [empresaId] | [empresaId, hasta] | [empresaId, desde, hasta]
      let clave: string;
      if (params.length === 3) clave = `${params[1]}|${params[2]}`;
      else if (params.length === 2) clave = `|${params[1]}`;
      else clave = '|';
      return Promise.resolve(opts.filasPorRango.get(clave) ?? []);
    },
  } as any;
}

function fila(codigo: string, tipo: string, naturaleza: string, debe: number, haber: number): Fila {
  return { codigo, nombre: codigo, tipo, naturaleza, nivel: '4', total_debe: String(debe), total_haber: String(haber) };
}

describe('ReportesFinancierosService.balanceGeneral — líneas calculadas', () => {
  it('Resultado del ejercicio = ingresos - costos - gastos del año en curso, y entra en Patrimonio', async () => {
    const fechaCorte = '2026-06-30';
    const ds = makeDataSource({
      filasPorRango: new Map([
        // balance a la fecha de corte (activo/pasivo/patrimonio)
        [`|${fechaCorte}`, [
          fila('1.1.1.02', 'activo', 'deudora', 500_000, 0),
          fila('2.1.1.01', 'pasivo', 'acreedora', 0, 100_000),
          fila('3.1.1.01', 'patrimonio', 'acreedora', 0, 200_000), // capital social, ya existente
        ]],
        // resultado del ejercicio: 2026-01-01 .. 2026-06-30
        [`2026-01-01|${fechaCorte}`, [
          fila('4.1.1.01', 'ingreso', 'acreedora', 0, 300_000),
          fila('5.1.1.01', 'costo',   'deudora',   120_000, 0),
          fila('6.1.1.01', 'gasto',   'deudora',   30_000,  0),
        ]],
        // resultados acumulados: hasta 2025-12-31 (sin actividad en este caso)
        [`|2025-12-31`, []],
      ]),
      asientosDescuadrados: [],
    });
    const svc = new ReportesFinancierosService(ds, {} as any, { getEmpresaIdOrNull: () => 7 } as any, new SaldosCuentasService(ds));

    const bg = await svc.balanceGeneral(fechaCorte);

    // 300,000 - 120,000 - 30,000 = 150,000
    expect(bg.patrimonio.calculadas.resultadoDelEjercicio.monto).toBe(150_000);
    expect(bg.patrimonio.calculadas.resultadoDelEjercicio.desde).toBe('2026-01-01');
    expect(bg.patrimonio.calculadas.resultadosAcumulados.monto).toBe(0);
    // patrimonio total = 200,000 (capital) + 150,000 (resultado) + 0 (acumulados)
    expect(bg.patrimonio.total).toBe(350_000);
    // activo 500,000 = pasivo 100,000 + patrimonio 350,000 + ... falta 50,000
    // (caso a propósito NO cuadrado, para probar que la ecuación lo detecta)
    expect(bg.totales.ecuacion).toBe(50_000);
    expect(bg.totales.cuadrado).toBe(false);
  });

  it('Resultados acumulados suma el neto de todos los ejercicios anteriores (sin asiento de cierre)', async () => {
    const fechaCorte = '2027-03-15';
    const ds = makeDataSource({
      filasPorRango: new Map([
        [`|${fechaCorte}`, [fila('1.1.1.02', 'activo', 'deudora', 1_000_000, 0)]],
        [`2027-01-01|${fechaCorte}`, [fila('4.1.1.01', 'ingreso', 'acreedora', 0, 50_000)]],
        // resultados acumulados: todo lo anterior a 2027 (2026 completo, en este caso)
        [`|2026-12-31`, [
          fila('4.1.1.01', 'ingreso', 'acreedora', 0, 900_000),
          fila('5.1.1.01', 'costo',   'deudora',   400_000, 0),
          fila('6.1.1.01', 'gasto',   'deudora',   100_000, 0),
        ]],
      ]),
      asientosDescuadrados: [],
    });
    const svc = new ReportesFinancierosService(ds, {} as any, { getEmpresaIdOrNull: () => 7 } as any, new SaldosCuentasService(ds));

    const bg = await svc.balanceGeneral(fechaCorte);

    expect(bg.patrimonio.calculadas.resultadoDelEjercicio.monto).toBe(50_000);
    // 900,000 - 400,000 - 100,000 = 400,000
    expect(bg.patrimonio.calculadas.resultadosAcumulados.monto).toBe(400_000);
    expect(bg.patrimonio.calculadas.resultadosAcumulados.hasta).toBe('2026-12-31');
  });

  it('Diferencia por asientos descuadrados se reporta aparte, no se absorbe en la ecuación', async () => {
    const fechaCorte = '2026-12-31';
    const ds = makeDataSource({
      filasPorRango: new Map([
        [`|${fechaCorte}`, [fila('1.1.1.02', 'activo', 'deudora', 100_000, 0)]],
        [`2026-01-01|${fechaCorte}`, []],
        [`|2025-12-31`, []],
      ]),
      asientosDescuadrados: [
        { id: 1, fecha: '2026-05-01', tipoOrigen: 'factura', referenciaFolio: 'B01-0001', totalDebe: '1000.08', totalHaber: '1000.00' },
      ],
    });
    const svc = new ReportesFinancierosService(ds, {} as any, { getEmpresaIdOrNull: () => 7 } as any, new SaldosCuentasService(ds));

    const bg = await svc.balanceGeneral(fechaCorte);

    expect(bg.diferenciaAsientosDescuadrados.cantidad).toBe(1);
    expect(bg.diferenciaAsientosDescuadrados.total).toBeCloseTo(0.08, 2);
    // La ecuación NO absorbe el descuadre: activo=100,000, pasivo+patrimonio=0 → diferencia real de 100,000
    expect(bg.totales.ecuacion).toBe(100_000);
  });

  it('asientosDescuadrados() del service devuelve el listado scopeado por empresa', async () => {
    const ds = makeDataSource({
      filasPorRango: new Map(),
      asientosDescuadrados: [
        { id: 5, fecha: '2026-01-10', tipoOrigen: 'compra', referenciaFolio: 'OC-9', totalDebe: '500.00', totalHaber: '499.90' },
      ],
    });
    const svc = new ReportesFinancierosService(ds, {} as any, { getEmpresaIdOrNull: () => 7 } as any, new SaldosCuentasService(ds));

    const lista = await svc.asientosDescuadrados('2026-12-31');
    expect(lista).toHaveLength(1);
    expect(lista[0].diferencia).toBeCloseTo(0.1, 2);
  });
});
