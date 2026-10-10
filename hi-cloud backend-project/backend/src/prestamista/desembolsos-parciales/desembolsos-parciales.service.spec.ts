/**
 * Desembolsos parciales — ver docs/prestamista/etapa-2-resto.md §4. Mismo
 * patrón de mocks (QueryRunner, sin Postgres real) que pagos-anulacion.spec.ts.
 */
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DesembolsosParcialesService } from './desembolsos-parciales.service';

function buildService(responderQr: (sql: string, params: any[]) => any) {
  const qr = {
    connect: jest.fn(async () => {}),
    startTransaction: jest.fn(async () => {}),
    commitTransaction: jest.fn(async () => {}),
    rollbackTransaction: jest.fn(async () => {}),
    release: jest.fn(async () => {}),
    query: jest.fn(async (sql: string, params: any[] = []) => responderQr(sql, params)),
  };
  const ds = { createQueryRunner: () => qr };
  const asientos = { asientoDesembolsoPrestamo: jest.fn().mockResolvedValue(undefined) };
  const prestamosSvc = { recalcularSaldos: jest.fn().mockResolvedValue(undefined) };
  const svc = new DesembolsosParcialesService(ds as any, asientos as any, prestamosSvc as any);
  return { svc, qr, asientos, prestamosSvc };
}

const USUARIO = { id: 1, nombre: 'Jean Admin' };
const PRESTAMO_PARCIAL = { id: 10, numero: 'PRE-0010', estado: 'desembolso_parcial', desembolsado: 3000, montoPrincipal: 10000 };

function mockFeliz() {
  return (sql: string) => {
    if (sql.includes('FROM pr_prestamos') && sql.includes('FOR UPDATE')) return [PRESTAMO_PARCIAL];
    if (sql.includes('INSERT INTO pr_desembolsos_parciales')) return [{ id: 1, monto: 2000 }];
    return [];
  };
}

describe('DesembolsosParcialesService.registrar', () => {
  it('registra un tramo que no completa el desembolso: el préstamo sigue en desembolso_parcial', async () => {
    const { svc, qr, asientos, prestamosSvc } = buildService(mockFeliz());
    const r: any = await svc.registrar(7, { prestamoId: 10, monto: 2000, fecha: '2026-10-10' }, USUARIO);

    expect(r.completo).toBe(false);
    expect(r.desembolsado).toBe(5000);
    const updatePrestamo = qr.query.mock.calls.find(([sql]: any[]) => sql.includes('UPDATE pr_prestamos SET'));
    expect(updatePrestamo[1]).toEqual([5000, 'desembolso_parcial', 10, 7]);
    expect(asientos.asientoDesembolsoPrestamo).toHaveBeenCalledWith(10, 'PRE-0010', 2000, 'transferencia', '2026-10-10', 1, 0);
    expect(prestamosSvc.recalcularSaldos).not.toHaveBeenCalled();
    expect(qr.commitTransaction).toHaveBeenCalled();
  });

  it('un tramo que completa el total: pasa a al_dia y recalcula saldos', async () => {
    const { svc, qr, prestamosSvc } = buildService(mockFeliz());
    const r: any = await svc.registrar(7, { prestamoId: 10, monto: 7000, fecha: '2026-10-10' }, USUARIO);

    expect(r.completo).toBe(true);
    const updatePrestamo = qr.query.mock.calls.find(([sql]: any[]) => sql.includes('UPDATE pr_prestamos SET'));
    expect(updatePrestamo[1]).toEqual([10000, 'al_dia', 10, 7]);
    expect(prestamosSvc.recalcularSaldos).toHaveBeenCalledWith(7, 10);
  });

  it('un tramo que excede lo que falta: se rechaza', async () => {
    const { svc } = buildService(mockFeliz());
    await expect(svc.registrar(7, { prestamoId: 10, monto: 8000, fecha: '2026-10-10' }, USUARIO))
      .rejects.toThrow(/excede lo que falta/);
  });

  it('préstamo inexistente: NotFoundException', async () => {
    const { svc } = buildService(() => []);
    await expect(svc.registrar(7, { prestamoId: 999, monto: 100, fecha: '2026-10-10' }, USUARIO))
      .rejects.toThrow(NotFoundException);
  });

  it('préstamo sin desembolso pendiente: se rechaza', async () => {
    const { svc } = buildService((sql: string) =>
      sql.includes('FROM pr_prestamos') && sql.includes('FOR UPDATE') ? [{ ...PRESTAMO_PARCIAL, estado: 'al_dia' }] : []);
    await expect(svc.registrar(7, { prestamoId: 10, monto: 100, fecha: '2026-10-10' }, USUARIO))
      .rejects.toThrow(BadRequestException);
  });
});
