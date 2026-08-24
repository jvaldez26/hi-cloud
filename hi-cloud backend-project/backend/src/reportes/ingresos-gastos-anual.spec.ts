import { ReportesService } from './reportes.service';

/**
 * El gráfico de Ingresos & Gastos muestra el AÑO FISCAL, de enero a diciembre.
 *
 * Antes eran 12 meses rodantes calculados en el frontend con la zona del
 * navegador: arrancaba en septiembre del año anterior —inútil para leer un
 * ejercicio— y el 31 de diciembre a las 8 PM en Santo Domingo saltaba al año
 * siguiente, porque en UTC ya era 1 de enero.
 */

function servicio(opts: {
  filas?: { anio: number; mes: number; ingresos: number; gastos: number }[];
  aniosEnBD?: number[];
} = {}) {
  const consultas: any[] = [];
  const svc = new ReportesService(
    {
      query: async (sql: string, params: any[]) => {
        consultas.push({ sql, params });
        if (/DISTINCT EXTRACT\(YEAR/.test(sql)) {
          return (opts.aniosEnBD ?? []).map(a => ({ anio: String(a) }));
        }
        if (/FROM facturas/.test(sql)) {
          return (opts.filas ?? []).map(f => ({ anio: String(f.anio), mes: String(f.mes), total: String(f.ingresos) }));
        }
        if (/FROM gastos/.test(sql)) {
          return (opts.filas ?? []).map(f => ({ anio: String(f.anio), mes: String(f.mes), total: String(f.gastos) }));
        }
        return [];
      },
    } as any,
    {} as any,
    { getEmpresaId: () => 42 } as any,
  );
  return { svc, consultas };
}

describe('getIngresosGastosAnual — enero a diciembre, no 12 rodantes', () => {
  it('devuelve SIEMPRE los 12 meses, con ceros donde no hay datos', async () => {
    // Los meses futuros salen vacíos a propósito: ver el año completo con la
    // parte que falta es información, no ruido.
    const { svc } = servicio({ filas: [{ anio: 2026, mes: 3, ingresos: 1000, gastos: 400 }] });
    const r = await svc.getIngresosGastosAnual(2026);

    expect(r.meses).toHaveLength(12);
    expect(r.meses.map(m => m.mes)).toEqual([1,2,3,4,5,6,7,8,9,10,11,12]);
    expect(r.meses[2]).toMatchObject({ mes: 3, ingresos: 1000, gastos: 400 });
    expect(r.meses[0]).toMatchObject({ mes: 1, ingresos: 0, gastos: 0 });
    expect(r.meses[11]).toMatchObject({ mes: 12, ingresos: 0, gastos: 0 });
  });

  it('el rango va del 1 de enero al 31 de diciembre del año pedido', async () => {
    const { svc, consultas } = servicio();
    await svc.getIngresosGastosAnual(2025);

    const conFechas = consultas.filter(c => c.params?.length === 3);
    expect(conFechas.length).toBeGreaterThan(0);
    for (const c of conFechas) {
      expect(c.params[1]).toBe('2025-01-01');
      expect(c.params[2]).toBe('2025-12-31');
    }
  });

  it('filtra por empresaId en todas las consultas', async () => {
    const { svc, consultas } = servicio();
    await svc.getIngresosGastosAnual(2026);

    for (const c of consultas) {
      expect(c.sql).toContain('"empresaId"');
      expect(c.params[0]).toBe(42);
    }
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
