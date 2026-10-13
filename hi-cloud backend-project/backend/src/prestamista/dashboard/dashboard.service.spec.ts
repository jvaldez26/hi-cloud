/**
 * Etapa 4 — Cartera e indicadores. Dashboard no tenía NINGÚN test (la
 * auditoría de esta etapa lo confirmó). Mismo patrón que
 * cobranza.service.spec.ts: un `DataSource` simulado que responde a las
 * queries EXACTAS de DashboardPrestamistaService, con datos de DOS empresas
 * para confirmar que ninguna ve los números de la otra.
 */
import { DashboardPrestamistaService } from './dashboard.service';

function buildDs() {
  const prestamos = [
    // Empresa 1
    { id: 100, empresaId: 1, numero: 'PR-0001', deudorId: 10, montoPrincipal: 5000, saldoCapital: 3000, saldoMora: 300, saldoTotal: 3500, estado: 'moroso', diasMoraActual: 20, totalPagado: 2000 },
    { id: 102, empresaId: 1, numero: 'PR-0002', deudorId: 10, montoPrincipal: 2000, saldoCapital: 2000, saldoMora: 0, saldoTotal: 2000, estado: 'al_dia', diasMoraActual: 0, totalPagado: 0 },
    { id: 103, empresaId: 1, numero: 'PR-0003', deudorId: 12, montoPrincipal: 10000, saldoCapital: 8000, saldoMora: 1200, saldoTotal: 9200, estado: 'vencido', diasMoraActual: 95, totalPagado: 2000 },
    // Empresa 2 — jamás debe aparecer en una consulta con empresaId=1
    { id: 200, empresaId: 2, numero: 'OTRA-0001', deudorId: 20, montoPrincipal: 99999, saldoCapital: 99999, saldoMora: 9999, saldoTotal: 109998, estado: 'moroso', diasMoraActual: 50, totalPagado: 1 },
  ];
  const deudores = [
    { id: 10, empresaId: 1, nombre: 'Ana', apellidos: 'Pérez', isActive: true, prestamosActivos: 2, enListaNegra: false },
    { id: 12, empresaId: 1, nombre: 'Pedro', apellidos: 'Gómez', isActive: true, prestamosActivos: 1, enListaNegra: true },
    { id: 20, empresaId: 2, nombre: 'Carlos', apellidos: 'Otro', isActive: true, prestamosActivos: 1, enListaNegra: false },
  ];
  const solicitudes = [
    { empresaId: 1, estado: 'pendiente' }, { empresaId: 1, estado: 'aprobada' }, { empresaId: 1, estado: 'aprobada' },
    { empresaId: 2, estado: 'pendiente' }, { empresaId: 2, estado: 'pendiente' }, { empresaId: 2, estado: 'pendiente' },
  ];
  const pagos = [
    { empresaId: 1, fecha: '2026-09-15', montoPagado: 500 },
    { empresaId: 1, fecha: '2026-08-10', montoPagado: 300 },
    { empresaId: 2, fecha: '2026-09-15', montoPagado: 99999 },
  ];

  const query = jest.fn(async (sql: string, params: any[] = []): Promise<any[]> => {
    const [empresaId] = params;
    if (sql.includes('AS totalPrestamos')) {
      const propios = prestamos.filter(p => p.empresaId === empresaId);
      const activos = propios.filter(p => !['cancelado', 'pagado'].includes(p.estado));
      return [{
        totalPrestamos: activos.length,
        prestamosAlDia: propios.filter(p => p.estado === 'al_dia').length,
        prestamosMorosos: propios.filter(p => p.estado === 'moroso').length,
        prestamosVencidos: propios.filter(p => p.estado === 'vencido').length,
        prestamosPagados: propios.filter(p => p.estado === 'pagado').length,
        carteraActiva: activos.reduce((a, p) => a + p.montoPrincipal, 0),
        saldoCapitalTotal: activos.reduce((a, p) => a + p.saldoCapital, 0),
        moraTotal: activos.reduce((a, p) => a + p.saldoMora, 0),
        recaudadoTotal: propios.reduce((a, p) => a + p.totalPagado, 0),
      }];
    }
    if (sql.includes('AS totalDeudores')) {
      const propios = deudores.filter(d => d.empresaId === empresaId && d.isActive);
      return [{
        totalDeudores: propios.length,
        deudoresActivos: propios.filter(d => d.prestamosActivos > 0).length,
        enListaNegra: propios.filter(d => d.enListaNegra).length,
      }];
    }
    if (sql.includes('FROM pr_solicitudes')) {
      const propios = solicitudes.filter(s => s.empresaId === empresaId);
      const porEstado = new Map<string, number>();
      for (const s of propios) porEstado.set(s.estado, (porEstado.get(s.estado) ?? 0) + 1);
      return [...porEstado.entries()].map(([estado, cantidad]) => ({ estado, cantidad }));
    }
    if (sql.includes('AS sinMora')) {
      const propios = prestamos.filter(p => p.empresaId === empresaId && !['cancelado', 'pagado'].includes(p.estado));
      return [{
        sinMora: propios.filter(p => p.diasMoraActual === 0).length,
        mora1a30: propios.filter(p => p.diasMoraActual >= 1 && p.diasMoraActual <= 30).length,
        mora31a60: propios.filter(p => p.diasMoraActual >= 31 && p.diasMoraActual <= 60).length,
        mora61a90: propios.filter(p => p.diasMoraActual >= 61 && p.diasMoraActual <= 90).length,
        moraMas90: propios.filter(p => p.diasMoraActual > 90).length,
      }];
    }
    if (sql.includes('FROM pr_pagos')) {
      const propios = pagos.filter(p => p.empresaId === empresaId);
      const porMes = new Map<string, number>();
      for (const p of propios) {
        const mes = p.fecha.slice(0, 7);
        porMes.set(mes, (porMes.get(mes) ?? 0) + p.montoPagado);
      }
      return [...porMes.entries()].sort().map(([mes, total]) => ({ mes, total }));
    }
    if (sql.includes('FROM pr_prestamos p JOIN pr_deudores d')) {
      return prestamos
        .filter(p => p.empresaId === empresaId && ['moroso', 'vencido'].includes(p.estado))
        .sort((a, b) => b.saldoTotal - a.saldoTotal)
        .slice(0, 10)
        .map(p => {
          const d = deudores.find(x => x.id === p.deudorId)!;
          return { nombre: d.nombre, apellidos: d.apellidos, saldoTotal: p.saldoTotal, diasMoraActual: p.diasMoraActual, estado: p.estado, numero: p.numero };
        });
    }
    return [];
  });

  const svc = new DashboardPrestamistaService({ query } as any);
  return { svc, query };
}

describe('DashboardPrestamistaService — KPIs y aislamiento multi-tenant (Etapa 4)', () => {
  it('calcula los KPIs principales solo con los préstamos de la empresa', async () => {
    const { svc } = buildDs();
    const r = await svc.getKpis(1);
    expect(r.kpis.totalPrestamos).toBe(3);
    expect(r.kpis.prestamosMorosos).toBe(1);
    expect(r.kpis.prestamosVencidos).toBe(1);
    expect(r.kpis.carteraActiva).toBe(17000);
    expect(r.kpis.saldoCapitalTotal).toBe(13000);
    expect(r.kpis.moraTotal).toBe(1500);
    expect(r.kpis.recaudadoTotal).toBe(4000);
  });

  it('la empresa 2 nunca ve los números de la empresa 1 (ni al revés)', async () => {
    const { svc } = buildDs();
    const e1 = await svc.getKpis(1);
    const e2 = await svc.getKpis(2);
    expect(e1.kpis.carteraActiva).not.toBe(e2.kpis.carteraActiva);
    expect(e2.kpis.carteraActiva).toBe(99999);
    expect(e2.kpis.moraTotal).toBe(9999);
  });

  it('deudoresKpi cuenta solo deudores activos de la empresa, incluida lista negra', async () => {
    const { svc } = buildDs();
    const r = await svc.getKpis(1);
    expect(r.deudoresKpi.totalDeudores).toBe(2);
    expect(r.deudoresKpi.deudoresActivos).toBe(2);
    expect(r.deudoresKpi.enListaNegra).toBe(1);
  });

  it('solicitudes se agrupan por estado sin mezclar empresas', async () => {
    const { svc } = buildDs();
    const r1 = await svc.getKpis(1);
    const grupos1 = Object.fromEntries(r1.solicitudes.map((s: any) => [s.estado, s.cantidad]));
    expect(grupos1).toEqual({ pendiente: 1, aprobada: 2 });

    const r2 = await svc.getKpis(2);
    const grupos2 = Object.fromEntries(r2.solicitudes.map((s: any) => [s.estado, s.cantidad]));
    expect(grupos2).toEqual({ pendiente: 3 });
  });

  it('distribución de mora por buckets clasifica 20 días en 1-30 y 95 en +90', async () => {
    const { svc } = buildDs();
    const r = await svc.getKpis(1);
    expect(r.distribucionMora.mora1a30).toBe(1);
    expect(r.distribucionMora.moraMas90).toBe(1);
    expect(r.distribucionMora.sinMora).toBe(1);
  });

  it('recaudación mensual suma los pagos de la empresa, nunca los de otra', async () => {
    const { svc } = buildDs();
    const r = await svc.getKpis(1);
    const total = r.recaudacionMes.reduce((a: number, m: any) => a + m.total, 0);
    expect(total).toBe(800);
  });

  it('top deudores morosos solo incluye moroso/vencido y nunca al de otra empresa', async () => {
    const { svc } = buildDs();
    const r = await svc.getKpis(1);
    expect(r.topDeudores).toHaveLength(2);
    expect(r.topDeudores.map((d: any) => d.nombre)).not.toContain('Carlos');
    expect(r.topDeudores[0].saldoTotal).toBeGreaterThanOrEqual(r.topDeudores[1].saldoTotal);
  });
});
