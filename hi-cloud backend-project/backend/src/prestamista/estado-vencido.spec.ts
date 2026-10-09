/**
 * Etapa 1 (auditoría Prestamista) — 'vencido' pasa de ser un estado muerto
 * (solo se leía en dashboard/cobranza/reportes, nunca se escribía) a tener
 * una regla real: clasificarMorosidad() en utils/mora.util.ts. Este spec
 * cubre los dos caminos que, además del cron, también recalculan el estado
 * de un préstamo: PagosService.registrar() y PrestamosService
 * .recalcularSaldos() — ver mora.cron.spec.ts para la cobertura del cron.
 */
import { PagosService } from './pagos/pagos.service';
import { PrestamosService } from './prestamos/prestamos.service';

const PRESTAMO_BASE = { id: 5, estado: 'moroso', deudorId: 3, totalPagado: 0, diasGracia: 5 };

function buildPagosService(saldosRow: any) {
  const asientos = { asientoPagoPrestamo: jest.fn().mockResolvedValue(undefined) };
  const emitirEcf = { execute: jest.fn().mockResolvedValue(undefined) };
  const tenantSvc = { getUserId: () => 42 };
  const qr = {
    connect: jest.fn(async () => {}),
    startTransaction: jest.fn(async () => {}),
    commitTransaction: jest.fn(async () => {}),
    rollbackTransaction: jest.fn(async () => {}),
    release: jest.fn(async () => {}),
    query: jest.fn(async (sql: string) => {
      if (sql.includes('FROM pr_cuotas') && sql.includes('FOR UPDATE')) return [];
      if (sql.includes('siguiente_numero_secuencia')) return [{ num: '0001' }];
      if (sql.includes('INSERT INTO pr_pagos')) return [{ id: 900 }];
      if (sql.includes('SUM(GREATEST')) return [saldosRow];
      return [];
    }),
  };
  // La verificación del préstamo (`SELECT * FROM pr_prestamos WHERE id=...`,
  // pagos.service.ts:76-77) corre en this.ds, NO en el QueryRunner — es
  // ANTES de abrir la transacción.
  const ds = {
    createQueryRunner: () => qr,
    query: jest.fn(async (sql: string) => (sql.includes('FROM pr_prestamos') ? [PRESTAMO_BASE] : [])),
  };
  return { svc: new PagosService(ds as any, asientos as any, emitirEcf as any, tenantSvc as any), qr };
}

describe('PagosService.registrar() — clasifica al_dia/moroso/vencido tras aplicar el pago', () => {
  it('atraso máximo por encima del umbral (90 días) → "vencido"', async () => {
    const { svc, qr } = buildPagosService({
      saldoCapital: 100, saldoInteres: 0, saldoMora: 0, cuotasPendientes: 1, cuotasVencidas: 1, maxDiasMora: 120,
    });
    await svc.registrar(1, { prestamoId: 5, montoPagado: 1 });
    const params = qr.query.mock.calls.find((c: any) => c[0].includes('UPDATE pr_prestamos'))![1];
    expect(params[6]).toBe('vencido'); // posición de estado en el UPDATE
  });

  it('atraso dentro del umbral → sigue "moroso" (sin regresión)', async () => {
    const { svc, qr } = buildPagosService({
      saldoCapital: 100, saldoInteres: 0, saldoMora: 0, cuotasPendientes: 1, cuotasVencidas: 1, maxDiasMora: 30,
    });
    await svc.registrar(1, { prestamoId: 5, montoPagado: 1 });
    const params = qr.query.mock.calls.find((c: any) => c[0].includes('UPDATE pr_prestamos'))![1];
    expect(params[6]).toBe('moroso');
  });

  it('saldo en cero y sin cuotas pendientes → "pagado", nunca "vencido" aunque hubiera estado muy atrasado', async () => {
    const { svc, qr } = buildPagosService({
      saldoCapital: 0, saldoInteres: 0, saldoMora: 0, cuotasPendientes: 0, cuotasVencidas: 0, maxDiasMora: 200,
    });
    await svc.registrar(1, { prestamoId: 5, montoPagado: 100 });
    const params = qr.query.mock.calls.find((c: any) => c[0].includes('UPDATE pr_prestamos'))![1];
    expect(params[6]).toBe('pagado');
  });
});

function buildPrestamosServiceParaRecalculo(saldosRow: any) {
  const ds = {
    query: jest.fn(async (sql: string) => {
      if (sql.includes('FROM pr_prestamos p')) return [{ ...PRESTAMO_BASE, numero: 'PRE-0001' }];
      if (sql.includes('SUM(GREATEST')) return [saldosRow];
      return [];
    }),
  };
  return new PrestamosService(ds as any, {} as any, { getUserId: () => 42 } as any);
}

describe('PrestamosService.recalcularSaldos() — misma clasificación, y ahora SÍ respeta diasGracia', () => {
  it('atraso máximo por encima del umbral → "vencido"', async () => {
    const svc = buildPrestamosServiceParaRecalculo({
      saldoCapital: 100, saldoInteres: 0, saldoMora: 0, cuotasPendientes: 1, cuotasVencidas: 1, maxDiasMora: 95, totalPagadoCuotas: 0,
    });
    const res = await svc.recalcularSaldos(1, 5);
    expect(res.estado).toBe('vencido');
  });

  it('cuota vencida pero dentro de la gracia → "al_dia" (antes: "moroso" a pesar de la gracia)', async () => {
    const svc = buildPrestamosServiceParaRecalculo({
      saldoCapital: 100, saldoInteres: 0, saldoMora: 0, cuotasPendientes: 1, cuotasVencidas: 1, maxDiasMora: 3, totalPagadoCuotas: 0,
    });
    const res = await svc.recalcularSaldos(1, 5);
    expect(res.estado).toBe('al_dia'); // diasGracia=5 en PRESTAMO_BASE, 3 días de atraso no la supera
  });
});
