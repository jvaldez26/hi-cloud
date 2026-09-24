import { ReportesService } from './reportes.service';

/**
 * El gráfico de Ingresos & Gastos muestra el AÑO FISCAL, de enero a diciembre.
 *
 * Antes eran 12 meses rodantes calculados en el frontend con la zona del
 * navegador: arrancaba en septiembre del año anterior —inútil para leer un
 * ejercicio— y el 31 de diciembre a las 8 PM en Santo Domingo saltaba al año
 * siguiente, porque en UTC ya era 1 de enero.
 *
 * Desde 2026-09-24 los totales salen de SaldosCuentasService (misma fuente
 * que Estado de Resultados) en vez de sumar facturas/gastos crudos — una
 * llamada por mes, filtrando por tipo de cuenta ('ingreso' / 'gasto').
 */

function servicio(opts: {
  saldosPorMes?: Record<string, { tipo: string; saldo: number }[]>; // clave 'YYYY-MM'
  aniosEnBD?: number[];
} = {}) {
  const llamadas: { empresaId: number; desde: string; hasta: string }[] = [];
  const saldosCuentasService = {
    obtenerSaldos: async (empresaId: number, desde: string, hasta: string) => {
      llamadas.push({ empresaId, desde, hasta });
      const clave = desde.substring(0, 7);
      return opts.saldosPorMes?.[clave] ?? [];
    },
  };
  const svc = new ReportesService(
    {
      query: async (sql: string) => {
        if (/DISTINCT EXTRACT\(YEAR/.test(sql)) {
          return (opts.aniosEnBD ?? []).map(a => ({ anio: String(a) }));
        }
        return [];
      },
    } as any,
    {} as any,
    { getEmpresaId: () => 42 } as any,
    saldosCuentasService as any,
  );
  return { svc, llamadas };
}

describe('getIngresosGastosAnual — enero a diciembre, no 12 rodantes', () => {
  it('devuelve SIEMPRE los 12 meses, con ceros donde no hay datos', async () => {
    // Los meses futuros salen vacíos a propósito: ver el año completo con la
    // parte que falta es información, no ruido.
    const { svc } = servicio({
      saldosPorMes: { '2026-03': [{ tipo: 'ingreso', saldo: 1000 }, { tipo: 'gasto', saldo: 400 }] },
    });
    const r = await svc.getIngresosGastosAnual(2026);

    expect(r.meses).toHaveLength(12);
    expect(r.meses.map(m => m.mes)).toEqual([1,2,3,4,5,6,7,8,9,10,11,12]);
    expect(r.meses[2]).toMatchObject({ mes: 3, ingresos: 1000, gastos: 400 });
    expect(r.meses[0]).toMatchObject({ mes: 1, ingresos: 0, gastos: 0 });
    expect(r.meses[11]).toMatchObject({ mes: 12, ingresos: 0, gastos: 0 });
  });

  it('solo cuenta tipo "ingreso" como ingreso y tipo "gasto" como gasto — Costo de Ventas queda fuera', async () => {
    const { svc } = servicio({
      saldosPorMes: {
        '2026-05': [
          { tipo: 'ingreso', saldo: 5000 },
          { tipo: 'costo',   saldo: 2000 }, // Costo de Ventas — NO debe sumar a "gastos" de este widget
          { tipo: 'gasto',   saldo: 800 },
        ],
      },
    });
    const r = await svc.getIngresosGastosAnual(2026);
    expect(r.meses[4]).toMatchObject({ mes: 5, ingresos: 5000, gastos: 800 });
  });

  it('un mes es una llamada a obtenerSaldos con el rango exacto de ese mes', async () => {
    const { svc, llamadas } = servicio();
    await svc.getIngresosGastosAnual(2025);

    expect(llamadas).toHaveLength(12);
    expect(llamadas[0]).toMatchObject({ desde: '2025-01-01', hasta: '2025-01-31' });
    expect(llamadas[1]).toMatchObject({ desde: '2025-02-01', hasta: '2025-02-28' }); // no bisiesto
    expect(llamadas[11]).toMatchObject({ desde: '2025-12-01', hasta: '2025-12-31' });
  });

  it('febrero bisiesto llega hasta el 29', async () => {
    const { svc, llamadas } = servicio();
    await svc.getIngresosGastosAnual(2028);
    expect(llamadas[1]).toMatchObject({ desde: '2028-02-01', hasta: '2028-02-29' });
  });

  it('filtra por empresaId en todas las llamadas', async () => {
    const { svc, llamadas } = servicio();
    await svc.getIngresosGastosAnual(2026);
    expect(llamadas.every(l => l.empresaId === 42)).toBe(true);
  });

  it('sin año usa el año en curso — y lo saca de la zona RD', async () => {
    // fechaHoyRD fija America/Santo_Domingo, así que esto no depende de la zona
    // en la que corra el proceso ni del servidor.
    const { svc } = servicio();
    const r = await svc.getIngresosGastosAnual();

    const anioRD = Number(
      new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santo_Domingo' }).substring(0, 4),
    );
    expect(r.anio).toBe(anioRD);
    expect(r.meses.every(m => m.anio === anioRD)).toBe(true);
  });

  it('cachea 2 minutos — una segunda llamada inmediata no repite las consultas', async () => {
    const { svc, llamadas } = servicio({
      saldosPorMes: { '2026-01': [{ tipo: 'ingreso', saldo: 100 }] },
    });
    await svc.getIngresosGastosAnual(2026);
    const llamadasTrasPrimera = llamadas.length;
    await svc.getIngresosGastosAnual(2026);
    expect(llamadas.length).toBe(llamadasTrasPrimera);
  });

  it('EL CASO DE NOCHEVIEJA: a las 8 PM del 31/12 en RD sigue siendo ese año', async () => {
    // 2026-12-31 20:00 RD = 2027-01-01 00:00 UTC. Con la zona del servidor el
    // gráfico saltaría a 2027 esa noche y aparecería vacío.
    const enUTC = new Date('2027-01-01T00:00:00Z');
    expect(enUTC.toLocaleDateString('en-CA', { timeZone: 'UTC' }).substring(0, 4)).toBe('2027');
    expect(enUTC.toLocaleDateString('en-CA', { timeZone: 'America/Santo_Domingo' }).substring(0, 4)).toBe('2026');
  });
});

describe('getAniosConDatos — el selector', () => {
  it('devuelve los años de la empresa, del más reciente al más antiguo', async () => {
    const { svc } = servicio({ aniosEnBD: [2024, 2026, 2025] });
    expect(await svc.getAniosConDatos()).toEqual([2026, 2025, 2024]);
  });

  it('incluye el año en curso aunque todavía no tenga movimientos', async () => {
    // Es el que se muestra por defecto: la lista no puede salir sin él, o el
    // selector arrancaría en un año que no es el que se está viendo.
    const enCurso = Number(
      new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santo_Domingo' }).substring(0, 4),
    );
    const { svc } = servicio({ aniosEnBD: [2020, 2021] });
    const r = await svc.getAniosConDatos();

    expect(r).toContain(enCurso);
    expect(r[0]).toBe(enCurso);   // y va primero
  });

  it('sin datos devuelve al menos el año en curso, nunca una lista vacía', async () => {
    const { svc } = servicio({ aniosEnBD: [] });
    expect((await svc.getAniosConDatos()).length).toBeGreaterThanOrEqual(1);
  });

  it('no repite años', async () => {
    const enCurso = Number(
      new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santo_Domingo' }).substring(0, 4),
    );
    const { svc } = servicio({ aniosEnBD: [enCurso, enCurso, 2020] });
    const r = await svc.getAniosConDatos();
    expect(new Set(r).size).toBe(r.length);
  });
});
