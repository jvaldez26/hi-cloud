/**
 * Anulación de pagos con reversa — ver docs/prestamista/etapa-2-resto.md §1.
 * Mismo patrón de mocks (QueryRunner, sin Postgres real) que
 * pagos-idempotencia.spec.ts / desembolso-transaccional.spec.ts.
 */
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PagosService } from './pagos.service';

function buildService(responderQr: (sql: string, params: any[]) => any) {
  const qr = {
    connect: jest.fn(async () => {}),
    startTransaction: jest.fn(async () => {}),
    commitTransaction: jest.fn(async () => {}),
    rollbackTransaction: jest.fn(async () => {}),
    release: jest.fn(async () => {}),
    query: jest.fn(async (sql: string, params: any[] = []) => responderQr(sql, params)),
  };
  const ds = { createQueryRunner: () => qr, query: jest.fn().mockResolvedValue([]) };
  const asientos = { revertirAsiento: jest.fn().mockResolvedValue(undefined) };
  const emitirEcf = { execute: jest.fn().mockResolvedValue(undefined) };
  const tenantSvc = { getUserId: () => 42 };
  const feriadosSvc = { obtenerSetFeriados: jest.fn().mockResolvedValue(new Set()) };
  const svc = new PagosService(ds as any, asientos as any, emitirEcf as any, tenantSvc as any, feriadosSvc as any);
  return { svc, ds, qr, asientos };
}

const USUARIO = { id: 1, nombre: 'Jean Admin' };

const PAGO_ACTIVO = {
  id: 900, numero: 'PAG-0001', prestamoId: 5, deudorId: 3,
  montoPagado: 500, montoExtraCapital: 0, estado: 'activo',
  cuotasAfectadas: [{ cuotaId: 1, pagInt: 100, pagCap: 400, pagMora: 0, pagCargos: 0, totalPagado: 500 }],
};
const CUOTA_PAGADA = {
  id: 1, capital: 400, interes: 100, capitalPagado: 400, interesPagado: 100,
  moraGenerada: 0, moraPagada: 0, cargosPagados: 0, totalPagado: 500, estado: 'pagada',
};
const PRESTAMO = { id: 5, estado: 'al_dia', deudorId: 3, totalPagado: 500, diasGracia: 0 };
const SALDOS_TRAS_REVERSA = { saldoCapital: 400, saldoInteres: 100, saldoMora: 0, cuotasPendientes: 1, cuotasVencidas: 0, maxDiasMora: 0 };

function mockFeliz(qr: ReturnType<typeof buildService>['qr']) {
  return (sql: string) => {
    if (sql.includes('FROM pr_pagos') && sql.includes('FOR UPDATE')) return [PAGO_ACTIVO];
    if (sql.includes("estado='activo'") && sql.includes('ORDER BY fecha DESC')) return [{ id: 900 }]; // es el más reciente
    if (sql.includes('FROM ecf')) return []; // sin e-CF
    if (sql.includes('FROM pr_cuotas WHERE id=')) return [CUOTA_PAGADA];
    if (sql.includes('FROM pr_prestamos WHERE id=')) return [PRESTAMO];
    if (sql.includes('SUM(GREATEST')) return [SALDOS_TRAS_REVERSA];
    if (sql.includes("UPDATE pr_pagos SET estado='anulado'")) return [{ ...PAGO_ACTIVO, estado: 'anulado' }];
    return [];
  };
}

describe('PagosService.anular — reversa completa', () => {
  it('revierte la cuota a pendiente, recalcula saldos, revierte al deudor y genera la reversa del asiento', async () => {
    const { svc, qr, asientos } = buildService(() => []);
    qr.query.mockImplementation(async (sql: string) => mockFeliz(qr)(sql));

    const r: any = await svc.anular(7, 900, 'Cajera registró el pago equivocado', USUARIO);

    expect(r.pago.estado).toBe('anulado');
    expect(r.saldos).toEqual({ saldoCapital: 400, saldoInteres: 100, saldoMora: 0, saldoTotal: 500 });

    // La cuota vuelve a pendiente (capitalPagado/interesPagado llegan a 0) y fechaPago se limpia.
    const updateCuota = qr.query.mock.calls.find(([sql]: any[]) => sql.includes('UPDATE pr_cuotas SET'));
    expect(updateCuota[1]).toEqual([0, 0, 0, 0, 0, 'pendiente', 1]);

    expect(qr.commitTransaction).toHaveBeenCalled();
    expect(qr.rollbackTransaction).not.toHaveBeenCalled();
    expect(asientos.revertirAsiento).toHaveBeenCalledWith(
      'prestamista', 900, expect.any(String), 'Cajera registró el pago equivocado', 'PAG-0001',
    );
  });

  it('pago inexistente: NotFoundException', async () => {
    const { svc } = buildService(() => []);
    await expect(svc.anular(7, 999, 'motivo', USUARIO)).rejects.toThrow(NotFoundException);
  });

  it('pago ya anulado: BadRequestException, nunca llega a tocar cuotas', async () => {
    const { svc, qr } = buildService(() => []);
    qr.query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM pr_pagos') && sql.includes('FOR UPDATE')) return [{ ...PAGO_ACTIVO, estado: 'anulado' }];
      return [];
    });
    await expect(svc.anular(7, 900, 'motivo', USUARIO)).rejects.toThrow(BadRequestException);
    expect(qr.query.mock.calls.some(([sql]: any[]) => sql.includes('FROM pr_cuotas'))).toBe(false);
  });

  it('pago con abono extraordinario: se rechaza — no se puede revertir automáticamente', async () => {
    const { svc, qr } = buildService(() => []);
    qr.query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM pr_pagos') && sql.includes('FOR UPDATE')) return [{ ...PAGO_ACTIVO, montoExtraCapital: 1000 }];
      return [];
    });
    await expect(svc.anular(7, 900, 'motivo', USUARIO)).rejects.toThrow(/abono extraordinario/);
  });

  it('no es el pago más reciente del préstamo: se rechaza (regla LIFO)', async () => {
    const { svc, qr } = buildService(() => []);
    qr.query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM pr_pagos') && sql.includes('FOR UPDATE')) return [PAGO_ACTIVO];
      if (sql.includes("estado='activo'") && sql.includes('ORDER BY fecha DESC')) return [{ id: 901 }]; // hay uno más nuevo
      return [];
    });
    await expect(svc.anular(7, 900, 'motivo', USUARIO)).rejects.toThrow(/más reciente/);
  });

  it('e-CF ya ACEPTADO por DGII: se rechaza — debe corregirse vía NC al 607', async () => {
    const { svc, qr } = buildService(() => []);
    qr.query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM pr_pagos') && sql.includes('FOR UPDATE')) return [PAGO_ACTIVO];
      if (sql.includes("estado='activo'") && sql.includes('ORDER BY fecha DESC')) return [{ id: 900 }];
      if (sql.includes('FROM ecf')) return [{ id: 55, estadoDGII: 'aceptado' }];
      return [];
    });
    await expect(svc.anular(7, 900, 'motivo', USUARIO)).rejects.toThrow(/Nota de Crédito/);
  });

  it('e-CF en pendiente_envio (nunca aceptado): se permite anular y el e-CF se marca inactivo', async () => {
    const { svc, qr } = buildService(() => []);
    qr.query.mockImplementation(async (sql: string) => {
      const base = mockFeliz(qr)(sql);
      if (sql.includes('FROM ecf')) return [{ id: 55, estadoDGII: 'pendiente_envio' }];
      return base;
    });

    await svc.anular(7, 900, 'motivo', USUARIO);

    const updateEcf = qr.query.mock.calls.find(([sql]: any[]) => sql.includes('UPDATE ecf SET'));
    expect(updateEcf[1]).toEqual([55]);
  });

  it('reversa parcial (la cuota quedó con un pago anterior además de este): vuelve a "parcial", no a "pendiente"', async () => {
    const { svc, qr } = buildService(() => []);
    const cuotaConHistoriaPrevia = { ...CUOTA_PAGADA, capitalPagado: 500, interesPagado: 150 }; // 400+100 de este pago + 100+50 de otro anterior
    qr.query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM pr_cuotas WHERE id=')) return [cuotaConHistoriaPrevia];
      return mockFeliz(qr)(sql);
    });

    await svc.anular(7, 900, 'motivo', USUARIO);

    const updateCuota = qr.query.mock.calls.find(([sql]: any[]) => sql.includes('UPDATE pr_cuotas SET'));
    // 500-400=100 capital, 150-100=50 interes — queda algo pagado → 'parcial'
    expect(updateCuota[1]).toEqual([50, 100, 0, 0, 0, 'parcial', 1]);
  });
});
