/**
 * Condonación independiente (§6, Etapa 2 resto) — perdona mora y/o interés
 * pendiente de un préstamo vivo, sin refinanciarlo. Capital nunca se
 * condona. Mismo patrón de mocks que pagos-anulacion.spec.ts.
 */
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CondonacionService } from './condonacion.service';

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
  const asientos = { asientoCondonacionPrestamo: jest.fn().mockResolvedValue(undefined) };
  const prestamosSvc = { recalcularSaldos: jest.fn().mockResolvedValue(undefined) };
  const svc = new CondonacionService(ds as any, asientos as any, prestamosSvc as any);
  return { svc, qr, asientos, prestamosSvc };
}

const USUARIO = { id: 1, nombre: 'Jean Admin' };
const PRESTAMO = { id: 20, numero: 'PRE-0020', estado: 'moroso' };

const CUOTA_A = { id: 201, moraGenerada: 100, moraPagada: 0, moraCondonada: 0, interes: 50, interesPagado: 0, interesCondonado: 0 };
const CUOTA_B = { id: 202, moraGenerada: 50, moraPagada: 0, moraCondonada: 0, interes: 40, interesPagado: 0, interesCondonado: 0 };

function mockFeliz() {
  return (sql: string) => {
    if (sql.includes('FROM pr_prestamos') && sql.includes('FOR UPDATE')) return [PRESTAMO];
    if (sql.includes('FROM pr_cuotas') && sql.includes("estado<>'pagada'")) return [CUOTA_A, CUOTA_B];
    return [];
  };
}

describe('CondonacionService.condonar', () => {
  it('condona mora de la cuota más vieja primero, y el resto de la siguiente', async () => {
    const { svc, qr, asientos, prestamosSvc } = buildService(mockFeliz());
    const r: any = await svc.condonar(7, 20, { moraACondonar: 120, motivo: 'Cliente de buena fe' }, USUARIO);

    expect(r.moraCondonada).toBe(120);
    expect(r.interesCondonado).toBe(0);

    const updates = qr.query.mock.calls.filter(([sql]: any[]) => sql.includes('UPDATE pr_cuotas SET'));
    expect(updates).toHaveLength(2);
    // Cuota A: 100 de mora condonada completa.
    expect(updates[0][1]).toEqual([100, 100, 0, 0, 201]);
    // Cuota B: el resto del presupuesto (20) de sus 50 pendientes.
    expect(updates[1][1]).toEqual([20, 20, 0, 0, 202]);

    expect(asientos.asientoCondonacionPrestamo).toHaveBeenCalledWith(20, 'PRE-0020', 120, 0, expect.any(String), 1);
    expect(prestamosSvc.recalcularSaldos).toHaveBeenCalledWith(7, 20);
    expect(qr.commitTransaction).toHaveBeenCalled();
  });

  it('condona interés y mora a la vez, cada uno con su propio presupuesto', async () => {
    const { svc } = buildService(mockFeliz());
    const r: any = await svc.condonar(7, 20, { moraACondonar: 50, interesACondonar: 30, motivo: 'x' }, USUARIO);
    expect(r.moraCondonada).toBe(50);
    expect(r.interesCondonado).toBe(30);
  });

  it('si se pide más de lo pendiente, lo cubre sin excederse y devuelve lo no aplicado', async () => {
    const { svc } = buildService(mockFeliz());
    const r: any = await svc.condonar(7, 20, { moraACondonar: 1000, motivo: 'x' }, USUARIO);
    expect(r.moraCondonada).toBe(150); // 100 + 50, todo lo pendiente
    expect(r.moraSolicitadaNoAplicada).toBe(850);
  });

  it('nunca toca capital ni cambia el estado a pagada', async () => {
    const { svc, qr } = buildService(mockFeliz());
    await svc.condonar(7, 20, { moraACondonar: 50, motivo: 'x' }, USUARIO);
    const update = qr.query.mock.calls.find(([sql]: any[]) => sql.includes('UPDATE pr_cuotas SET'));
    expect(update[0]).not.toMatch(/capital/i);
    expect(update[0]).toContain("estado='parcial'");
  });

  it('sin mora ni interés en el body: se rechaza antes de tocar nada', async () => {
    const { svc, qr } = buildService(mockFeliz());
    await expect(svc.condonar(7, 20, { motivo: 'x' }, USUARIO)).rejects.toThrow(BadRequestException);
    expect(qr.query.mock.calls.some(([sql]: any[]) => sql.includes('FROM pr_prestamos'))).toBe(false);
  });

  it('préstamo sin nada pendiente de condonar: se rechaza', async () => {
    const { svc } = buildService((sql: string) =>
      sql.includes('FROM pr_prestamos') && sql.includes('FOR UPDATE') ? [PRESTAMO]
      : sql.includes('FROM pr_cuotas') ? [] : []);
    await expect(svc.condonar(7, 20, { moraACondonar: 100, motivo: 'x' }, USUARIO)).rejects.toThrow(/no hay mora ni interés/i);
  });

  it.each(['cancelado', 'pagado', 'refinanciado'])('no condona un préstamo %s', async (estado) => {
    const { svc } = buildService((sql: string) =>
      sql.includes('FROM pr_prestamos') && sql.includes('FOR UPDATE') ? [{ ...PRESTAMO, estado }] : mockFeliz()(sql));
    await expect(svc.condonar(7, 20, { moraACondonar: 10, motivo: 'x' }, USUARIO)).rejects.toThrow(BadRequestException);
  });

  it('no condona un préstamo con desembolso pendiente (§4)', async () => {
    const { svc } = buildService((sql: string) =>
      sql.includes('FROM pr_prestamos') && sql.includes('FOR UPDATE') ? [{ ...PRESTAMO, estado: 'desembolso_parcial' }] : mockFeliz()(sql));
    await expect(svc.condonar(7, 20, { moraACondonar: 10, motivo: 'x' }, USUARIO)).rejects.toThrow(/desembolso pendiente/);
  });

  it('préstamo inexistente: NotFoundException', async () => {
    const { svc } = buildService((sql: string) =>
      sql.includes('FROM pr_prestamos') && sql.includes('FOR UPDATE') ? [] : []);
    await expect(svc.condonar(7, 20, { moraACondonar: 10, motivo: 'x' }, USUARIO)).rejects.toThrow(NotFoundException);
  });
});
