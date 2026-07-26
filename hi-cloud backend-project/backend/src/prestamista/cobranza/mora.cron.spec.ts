/**
 * C3 / C4 — Cron de mora, con la BD simulada.
 *
 * Comprueba el comportamiento observable: qué valores escribe el cron en
 * pr_cuotas y en pr_prestamos.
 *
 * El escenario que motivó C4: un cliente paga su mora durante el día y a
 * medianoche el cron la resucita porque fijaba el saldo BRUTO.
 */

import { MoraCronService } from './mora.cron';

interface Cuota {
  id: number;
  capital: number; interes: number;
  capitalPagado: number; interesPagado: number;
  diasMora: number;
  moraGenerada: number; moraPagada: number;
}

/**
 * DataSource simulado: responde a las 4 consultas del cron y aplica los UPDATE
 * de moraGenerada sobre las cuotas en memoria, para que el resumen posterior
 * vea los valores ya actualizados (igual que haría Postgres).
 */
function buildDs(opts: { porcentajeMora: number; diasGracia?: number; cuotas: Cuota[] }) {
  const cuotas = opts.cuotas.map(c => ({ ...c }));
  const updates: { sql: string; params: any[] }[] = [];

  const query = jest.fn(async (sql: string, params: any[] = []) => {
    updates.push({ sql, params });

    if (sql.includes('UPDATE pr_cuotas SET "diasMora"')) return [];

    if (sql.includes('FROM pr_prestamos')) {
      return [{
        id: 1, empresaId: 7,
        porcentajeMora: opts.porcentajeMora,
        diasGracia: opts.diasGracia ?? 0,
        saldoCapital: 0, saldoMora: 0,
      }];
    }

    // cuotas vencidas que superan los días de gracia
    if (sql.includes('SELECT id, capital, interes')) {
      const gracia = Number(params[1] ?? 0);
      return cuotas.filter(c => c.diasMora > gracia);
    }

    // el UPDATE de moraGenerada se aplica en memoria
    if (sql.includes('UPDATE pr_cuotas SET "moraGenerada"')) {
      const [monto, id] = params;
      const c = cuotas.find(x => x.id === id);
      if (c) c.moraGenerada = Number(monto);
      return [];
    }

    // resumen: replica la aritmética del SQL sobre las cuotas en memoria
    if (sql.includes('saldoMoraNeto')) {
      return [{
        cuotasVencidas: cuotas.filter(c => c.diasMora > 0).length,
        maxDiasMora:    Math.max(0, ...cuotas.map(c => c.diasMora)),
        saldoCap:       cuotas.reduce((a, c) => a + Math.max(0, c.capital - c.capitalPagado), 0),
        saldoMoraNeto:  cuotas.reduce((a, c) => a + Math.max(0, c.moraGenerada - c.moraPagada), 0),
      }];
    }

    return [];
  });

  const svc = new MoraCronService({ query } as any);
  const updatePrestamo = () => updates.find(u => u.sql.includes('UPDATE pr_prestamos'));
  return { svc, cuotas, updates, updatePrestamo };
}

const cuotaBase = (over: Partial<Cuota> = {}): Cuota => ({
  id: 1, capital: 10000, interes: 0,
  capitalPagado: 0, interesPagado: 0,
  diasMora: 10, moraGenerada: 0, moraPagada: 0,
  ...over,
});

describe('C3 — el cron ya genera mora con tasas normales', () => {
  it('5 %/mes, 10,000 pendientes, 10 días → 166.67 en la cuota', async () => {
    const { svc, updates } = buildDs({ porcentajeMora: 5, cuotas: [cuotaBase()] });
    await svc.calcularMora();

    const upd = updates.find(u => u.sql.includes('UPDATE pr_cuotas SET "moraGenerada"'));
    expect(upd).toBeDefined();
    expect(upd!.params[0]).toBeCloseTo(166.67, 2);
  });

  it('con la tasa baja del bug ya NO deja la mora en cero', async () => {
    const { svc, updatePrestamo } = buildDs({ porcentajeMora: 3, cuotas: [cuotaBase({ diasMora: 20 })] });
    await svc.calcularMora();
    expect(Number(updatePrestamo()!.params[0])).toBeGreaterThan(0);
  });

  it('la mora se calcula sobre capital + interés pendientes, no sobre el total', async () => {
    const { svc, updates } = buildDs({
      porcentajeMora: 5,
      cuotas: [cuotaBase({ capital: 10000, capitalPagado: 4000, interes: 1000, interesPagado: 1000 })],
    });
    await svc.calcularMora();
    // base = (10000-4000) + (1000-1000) = 6000 → 6000 × 5/100/30 × 10 = 100
    const upd = updates.find(u => u.sql.includes('UPDATE pr_cuotas SET "moraGenerada"'));
    expect(upd!.params[0]).toBeCloseTo(100, 2);
  });

  it('respeta los días de gracia', async () => {
    const { svc, updates } = buildDs({
      porcentajeMora: 5, diasGracia: 15, cuotas: [cuotaBase({ diasMora: 10 })],
    });
    await svc.calcularMora();
    expect(updates.some(u => u.sql.includes('UPDATE pr_cuotas SET "moraGenerada"'))).toBe(false);
  });

  it('no rebaja la mora ya devengada', async () => {
    const { svc, updates } = buildDs({
      porcentajeMora: 5, cuotas: [cuotaBase({ moraGenerada: 999 })],
    });
    await svc.calcularMora();
    // 166.67 < 999 → no debe escribir
    expect(updates.some(u => u.sql.includes('UPDATE pr_cuotas SET "moraGenerada"'))).toBe(false);
  });
});

describe('C4 — el cron no resucita la mora ya cobrada', () => {
  it('el saldo del préstamo queda NETO de lo pagado', async () => {
    // El cliente pagó hoy los 166.67 de mora de su cuota
    const { svc, updatePrestamo } = buildDs({
      porcentajeMora: 5,
      cuotas: [cuotaBase({ moraGenerada: 166.67, moraPagada: 166.67 })],
    });
    await svc.calcularMora();

    // Antes el cron escribía 166.67 (bruto) y la deuda reaparecía a medianoche
    expect(Number(updatePrestamo()!.params[0])).toBe(0);
  });

  it('con pago parcial deja solo el resto', async () => {
    const { svc, updatePrestamo } = buildDs({
      porcentajeMora: 5,
      cuotas: [cuotaBase({ moraGenerada: 166.67, moraPagada: 100 })],
    });
    await svc.calcularMora();
    expect(Number(updatePrestamo()!.params[0])).toBeCloseTo(66.67, 2);
  });

  it('varias cuotas: suma solo lo pendiente', async () => {
    const { svc, updatePrestamo } = buildDs({
      porcentajeMora: 5,
      cuotas: [
        cuotaBase({ id: 1, moraGenerada: 500, moraPagada: 500, diasMora: 40 }),
        cuotaBase({ id: 2, moraGenerada: 300, moraPagada: 100, diasMora: 30 }),
      ],
    });
    await svc.calcularMora();
    // bruto habría sido 800; neto = 0 + 200, más lo que devengue el recálculo
    const saldo = Number(updatePrestamo()!.params[0]);
    expect(saldo).toBeLessThan(800);
    expect(saldo).toBeGreaterThanOrEqual(200);
  });

  it('ejecutar el cron dos veces seguidas no aumenta el saldo (idempotente)', async () => {
    const cuotas = [cuotaBase({ moraGenerada: 166.67, moraPagada: 166.67 })];
    const a = buildDs({ porcentajeMora: 5, cuotas });
    await a.svc.calcularMora();
    const primera = Number(a.updatePrestamo()!.params[0]);

    const b = buildDs({ porcentajeMora: 5, cuotas: a.cuotas });
    await b.svc.calcularMora();
    const segunda = Number(b.updatePrestamo()!.params[0]);

    expect(segunda).toBe(primera);
  });

  it('un fallo de BD no tumba el cron (sigue capturando el error)', async () => {
    const svc = new MoraCronService({ query: jest.fn().mockRejectedValue(new Error('BD caída')) } as any);
    await expect(svc.calcularMora()).resolves.toBeUndefined();
  });
});
