/**
 * Etapa 7 — Scoring. Mismo patrón que dashboard.service.spec.ts/
 * cobranza.service.spec.ts: un DataSource simulado que responde a las
 * queries EXACTAS de DeudorScoringService, con datos de DOS empresas para
 * confirmar aislamiento multi-tenant, y varios perfiles de deudor para
 * cubrir los casos límite que exige el diseño (ver
 * docs/prestamista/etapa-7-scoring.md): sin historial, perfecto, con
 * condonación previa, y cambio de patrón de pago.
 */
import { NotFoundException } from '@nestjs/common';
import { DeudorScoringService } from './scoring.service';

function buildDs() {
  const deudores = [
    { id: 1, empresaId: 1, createdAt: '2026-01-01' }, // nuevo, sin préstamos
    { id: 2, empresaId: 1, createdAt: '2024-01-01' }, // perfecto
    { id: 3, empresaId: 1, createdAt: '2023-01-01' }, // con refinanciamiento + condonación
    { id: 4, empresaId: 1, createdAt: '2025-01-01' }, // cambio de patrón
    { id: 6, empresaId: 2, createdAt: '2026-01-01' }, // otra empresa
  ];

  const prestamos = [
    // Deudor 2 — perfecto: 1 préstamo ya pagado, sin mora nunca.
    { id: 200, empresaId: 1, deudorId: 2, estado: 'pagado', diasMoraActual: 0, fechaDesembolso: '2024-02-01' },
    // Deudor 3 — refinanciado (préstamo original cerrado como 'refinanciado'), mora leve en el nuevo.
    { id: 300, empresaId: 1, deudorId: 3, estado: 'refinanciado', diasMoraActual: 0, fechaDesembolso: '2023-02-01' },
    { id: 301, empresaId: 1, deudorId: 3, estado: 'moroso', diasMoraActual: 20, fechaDesembolso: '2024-06-01' },
    // Deudor 4 — buen historial, en mora leve ahora (cambio de patrón).
    { id: 400, empresaId: 1, deudorId: 4, estado: 'moroso', diasMoraActual: 10, fechaDesembolso: '2025-02-01' },
    // Deudor 6 — otra empresa, nunca debe filtrarse al consultar empresa 1.
    { id: 600, empresaId: 2, deudorId: 6, estado: 'pagado', diasMoraActual: 0, fechaDesembolso: '2026-02-01' },
  ];

  // cuotas 'pagada' por préstamo: { prestamoId, fechaPago, fechaVencimiento, moraCondonada, interesCondonado }
  const cuotas = [
    // Deudor 2 — 4 cuotas, todas a tiempo.
    { empresaId: 1, prestamoId: 200, estado: 'pagada', fechaPago: '2024-03-01', fechaVencimiento: '2024-03-01', moraCondonada: 0, interesCondonado: 0 },
    { empresaId: 1, prestamoId: 200, estado: 'pagada', fechaPago: '2024-04-01', fechaVencimiento: '2024-04-01', moraCondonada: 0, interesCondonado: 0 },
    { empresaId: 1, prestamoId: 200, estado: 'pagada', fechaPago: '2024-05-01', fechaVencimiento: '2024-05-01', moraCondonada: 0, interesCondonado: 0 },
    { empresaId: 1, prestamoId: 200, estado: 'pagada', fechaPago: '2024-05-30', fechaVencimiento: '2024-06-01', moraCondonada: 0, interesCondonado: 0 },
    // Deudor 3 — préstamo original tuvo condonación directa antes de refinanciarse; 2 de 4 pagadas tarde.
    { empresaId: 1, prestamoId: 300, estado: 'pagada', fechaPago: '2023-04-01', fechaVencimiento: '2023-03-01', moraCondonada: 500, interesCondonado: 300 },
    { empresaId: 1, prestamoId: 300, estado: 'pagada', fechaPago: '2023-05-01', fechaVencimiento: '2023-05-01', moraCondonada: 0, interesCondonado: 0 },
    { empresaId: 1, prestamoId: 301, estado: 'pagada', fechaPago: '2024-07-15', fechaVencimiento: '2024-07-01', moraCondonada: 0, interesCondonado: 0 },
    { empresaId: 1, prestamoId: 301, estado: 'pagada', fechaPago: '2024-08-01', fechaVencimiento: '2024-08-01', moraCondonada: 0, interesCondonado: 0 },
    // Deudor 4 — 5 cuotas, todas a tiempo históricamente (buen pagador que ahora se atrasó).
    { empresaId: 1, prestamoId: 400, estado: 'pagada', fechaPago: '2025-03-01', fechaVencimiento: '2025-03-01', moraCondonada: 0, interesCondonado: 0 },
    { empresaId: 1, prestamoId: 400, estado: 'pagada', fechaPago: '2025-04-01', fechaVencimiento: '2025-04-01', moraCondonada: 0, interesCondonado: 0 },
    { empresaId: 1, prestamoId: 400, estado: 'pagada', fechaPago: '2025-05-01', fechaVencimiento: '2025-05-01', moraCondonada: 0, interesCondonado: 0 },
    { empresaId: 1, prestamoId: 400, estado: 'pagada', fechaPago: '2025-06-01', fechaVencimiento: '2025-06-01', moraCondonada: 0, interesCondonado: 0 },
    // Deudor 6 — otra empresa, nunca debe contarse en la 1.
    { empresaId: 2, prestamoId: 600, estado: 'pagada', fechaPago: '2026-03-01', fechaVencimiento: '2026-03-01', moraCondonada: 0, interesCondonado: 0 },
  ];

  const refinanciamientos = [
    { empresaId: 1, deudorId: 3, moraCondonada: 200, interesCondonado: 100 },
  ];

  const garantias = [
    { empresaId: 1, deudorId: 2, estado: 'activa' },
  ];

  const garantes = [
    { empresaId: 1, prestamoId: 200, estado: 'activo' },
  ];

  const query = jest.fn(async (sql: string, params: any[] = []): Promise<any[]> => {
    const [deudorId, empresaId] = params;

    if (sql.includes('FROM pr_deudores WHERE id=')) {
      const d = deudores.find(x => x.id === deudorId && x.empresaId === empresaId);
      return d ? [d] : [];
    }
    if (sql.includes('"primerDesembolso"')) {
      const propios = prestamos.filter(p => p.deudorId === deudorId && p.empresaId === empresaId);
      const activos = propios.filter(p => !['cancelado', 'pagado', 'refinanciado'].includes(p.estado));
      const moraMax = activos.length ? Math.max(...activos.map(p => p.diasMoraActual)) : 0;
      const fechas = propios.map(p => p.fechaDesembolso).sort();
      return [{ total: propios.length, moraMax, primerDesembolso: fechas[0] ?? null }];
    }
    if (sql.includes('"aTiempo"')) {
      const propias = cuotas.filter(c => {
        const p = prestamos.find(x => x.id === c.prestamoId);
        return p && p.deudorId === deudorId && c.empresaId === empresaId && p.empresaId === empresaId && c.estado === 'pagada';
      });
      const aTiempo = propias.filter(c => c.fechaPago <= c.fechaVencimiento).length;
      return [{ total: propias.length, aTiempo }];
    }
    if (sql.includes('AS limpios')) {
      const propios = prestamos.filter(p => p.deudorId === deudorId && p.empresaId === empresaId && ['pagado', 'cancelado', 'refinanciado'].includes(p.estado));
      const limpios = propios.filter(p => {
        if (p.estado !== 'pagado') return false;
        const condonado = cuotas.filter(c => c.prestamoId === p.id && c.empresaId === empresaId)
          .reduce((a, c) => a + c.moraCondonada + c.interesCondonado, 0);
        return condonado === 0;
      });
      return [{ cerrados: propios.length, limpios: limpios.length }];
    }
    if (sql.includes('FROM pr_refinanciamientos')) {
      const propios = refinanciamientos.filter(r => r.deudorId === deudorId && r.empresaId === empresaId);
      const monto = propios.reduce((a, r) => a + r.moraCondonada + r.interesCondonado, 0);
      return [{ total: propios.length, montoCondonado: monto }];
    }
    if (sql.includes('"montoCondonado"')) {
      const propias = cuotas.filter(c => {
        const p = prestamos.find(x => x.id === c.prestamoId);
        return p && p.deudorId === deudorId && c.empresaId === empresaId && p.empresaId === empresaId;
      });
      const monto = propias.reduce((a, c) => a + c.moraCondonada + c.interesCondonado, 0);
      return [{ montoCondonado: monto }];
    }
    if (sql.includes('"tieneGarantia"')) {
      const tieneGarantia = garantias.some(g => g.deudorId === deudorId && g.empresaId === empresaId && g.estado === 'activa');
      const prestamosDelDeudor = prestamos.filter(p => p.deudorId === deudorId && p.empresaId === empresaId).map(p => p.id);
      const tieneGarante = garantes.some(g => prestamosDelDeudor.includes(g.prestamoId) && g.empresaId === empresaId && g.estado === 'activo');
      return [{ tieneGarantia, tieneGarante }];
    }
    return [];
  });

  const svc = new DeudorScoringService({ query } as any);
  return { svc, query };
}

describe('DeudorScoringService — motor de reglas (Etapa 7)', () => {
  it('deudor sin ningún préstamo: score neutral fijo de 60, banda C, sinHistorial=true', async () => {
    const { svc } = buildDs();
    const r = await svc.calcular(1, 1);
    expect(r.score).toBe(60);
    expect(r.banda).toBe('C');
    expect(r.sinHistorial).toBe(true);
    expect(r.factores.every(f => f.sinDato)).toBe(true);
    expect(r.alertaCambioPatron).toBe(false);
  });

  it('deudor perfecto: 100% a tiempo, sin mora, sin refinanciar/condonar, con respaldo → 100/100 banda A', async () => {
    const { svc } = buildDs();
    const r = await svc.calcular(1, 2);
    expect(r.score).toBe(100);
    expect(r.banda).toBe('A');
    expect(r.sinHistorial).toBe(false);
    const f = (k: string) => r.factores.find(x => x.factor === k)!;
    expect(f('puntualidad').puntos).toBe(30);
    expect(f('moraActual').puntos).toBe(20);
    expect(f('historial').puntos).toBe(25);
    expect(f('trayectoria').puntos).toBe(15);
    expect(f('respaldo').puntos).toBe(10);
  });

  it('deudor con refinanciamiento Y condonación previa: el factor 3 cae a 0/25 y el score queda muy por debajo de "Bueno"', async () => {
    const { svc } = buildDs();
    const r = await svc.calcular(1, 3);
    const f = (k: string) => r.factores.find(x => x.factor === k)!;
    expect(f('historial').puntos).toBe(0);
    expect(f('historial').detalle).toMatch(/refinanciamiento/);
    expect(f('historial').detalle).toMatch(/condonad/);
    expect(r.score).toBeLessThan(75);
  });

  it('deudor con buen historial pero en mora ahora mismo: dispara la alerta de cambio de patrón', async () => {
    const { svc } = buildDs();
    const r = await svc.calcular(1, 4);
    expect(r.alertaCambioPatron).toBe(true);
    expect(r.alertaCambioPatronDetalle).toMatch(/buen historial/);
  });

  it('nunca cuenta préstamos/cuotas/refinanciamientos/garantías de otra empresa', async () => {
    const { svc } = buildDs();
    await expect(svc.calcular(1, 6)).rejects.toThrow(NotFoundException);
  });

  it('deudor inexistente lanza NotFoundException', async () => {
    const { svc } = buildDs();
    await expect(svc.calcular(1, 999)).rejects.toThrow(NotFoundException);
  });
});
