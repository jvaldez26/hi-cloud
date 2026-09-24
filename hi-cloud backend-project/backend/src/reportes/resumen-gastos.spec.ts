import { ReportesService } from './reportes.service';

/**
 * Resumen de Gastos del mes (tarjeta del Inicio) — categorías del mes en
 * curso + comparación contra el mes anterior (flecha + %), mismo patrón que
 * el resto de los reportes del panel.
 */

function servicio(opts: {
  categoriasMesActual?: { categoria: string; monto: number }[];
  totalMesAnterior?: number;
} = {}) {
  const svc = new ReportesService(
    {
      query: async (sql: string, params: any[]) => {
        if (/GROUP BY categoria/.test(sql)) {
          return (opts.categoriasMesActual ?? []).map(c => ({ categoria: c.categoria, monto: String(c.monto) }));
        }
        if (/"totalAnterior"/.test(sql)) {
          return [{ totalAnterior: String(opts.totalMesAnterior ?? 0) }];
        }
        return [];
      },
    } as any,
    {} as any,
    { getEmpresaId: () => 42 } as any,
    {} as any,
  );
  return svc;
}

describe('ReportesService.getResumenGastos', () => {
  it('sin gastos el mes pasado: cambioPorcentaje es null, no +Infinity', async () => {
    const svc = servicio({
      categoriasMesActual: [{ categoria: 'oficina', monto: 500 }],
      totalMesAnterior: 0,
    });
    const r = await svc.getResumenGastos();

    expect(r.total).toBe(500);
    expect(r.totalMesAnterior).toBe(0);
    expect(r.cambioPorcentaje).toBeNull();
  });

  it('gasto subió respecto al mes anterior: % positivo', async () => {
    const svc = servicio({
      categoriasMesActual: [{ categoria: 'oficina', monto: 1500 }],
      totalMesAnterior: 1000,
    });
    const r = await svc.getResumenGastos();

    expect(r.cambioPorcentaje).toBe(50);
  });

  it('gasto bajó respecto al mes anterior: % negativo', async () => {
    const svc = servicio({
      categoriasMesActual: [{ categoria: 'oficina', monto: 400 }],
      totalMesAnterior: 1000,
    });
    const r = await svc.getResumenGastos();

    expect(r.cambioPorcentaje).toBe(-60);
  });

  it('trae mesNumero/anioNumero para que el frontend arme el link a /gastos filtrado', async () => {
    const svc = servicio();
    const r = await svc.getResumenGastos();

    const ahora = new Date();
    expect(r.mesNumero).toBe(ahora.getMonth() + 1);
    expect(r.anioNumero).toBe(ahora.getFullYear());
  });
});
