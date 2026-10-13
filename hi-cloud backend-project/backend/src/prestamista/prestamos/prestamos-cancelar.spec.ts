/**
 * Etapa 6 — Seguridad: cancelar() solo bloqueaba un préstamo YA cancelado,
 * así que dejaba "cancelar" (sin reversar nada, sin la autorización que sí
 * exigen anular/condonar/reestructurar) un préstamo con dinero ya
 * entregado (desembolso_parcial) o con pagos ya cobrados (totalPagado > 0)
 * — el mismo efecto que condonar el 100% de la deuda, sin ninguna de sus
 * salvaguardas. Ver docs/prestamista/etapa-6-seguridad.md.
 */
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrestamosService } from './prestamos.service';

function buildService(responder: (sql: string, params: any[]) => any) {
  const ds = { query: jest.fn(async (sql: string, params: any[] = []) => responder(sql, params)) };
  const asientos = {};
  const tenantSvc = {};
  const feriadosSvc = {};
  const svc = new PrestamosService(ds as any, asientos as any, tenantSvc as any, feriadosSvc as any);
  return { svc, ds };
}

const PRESTAMO_BASE = {
  id: 40, numero: 'PRE-0040', deudorId: 9, estado: 'al_dia', totalPagado: 0,
  deudorNombre: 'Juan Pérez', deudorCedula: '001-0000000-0',
};

function mockOrFail(prestamo: any) {
  return (sql: string) => {
    if (sql.includes('FROM pr_prestamos p')) return [prestamo];
    return [];
  };
}

describe('PrestamosService.cancelar — guardas de seguridad', () => {
  it('cancela sin problema un préstamo sin desembolso parcial y sin pagos', async () => {
    const { svc, ds } = buildService(mockOrFail(PRESTAMO_BASE));
    const r = await svc.cancelar(7, 40, 'Error de captura');
    expect(r).toEqual({ success: true });
    expect(ds.query.mock.calls.some(([sql]: any[]) => sql.includes("SET estado='cancelado'"))).toBe(true);
  });

  it('préstamo inexistente: NotFoundException', async () => {
    const { svc } = buildService(() => []);
    await expect(svc.cancelar(7, 999, 'motivo')).rejects.toThrow(NotFoundException);
  });

  it('ya cancelado: BadRequestException', async () => {
    const { svc } = buildService(mockOrFail({ ...PRESTAMO_BASE, estado: 'cancelado' }));
    await expect(svc.cancelar(7, 40, 'motivo')).rejects.toThrow(/ya cancelado/);
  });

  // Regresión del hueco real: antes de este fix, esto NO lanzaba nada — el
  // préstamo quedaba "cancelado" con la plata ya entregada y sin reversar
  // el desembolso.
  it('con desembolso_parcial (dinero YA entregado): se rechaza, no se puede cancelar', async () => {
    const { svc, ds } = buildService(mockOrFail({ ...PRESTAMO_BASE, estado: 'desembolso_parcial' }));
    await expect(svc.cancelar(7, 40, 'motivo')).rejects.toThrow(BadRequestException);
    await expect(svc.cancelar(7, 40, 'motivo')).rejects.toThrow(/desembolso pendiente/);
    // Nunca llega a tocar la fila — la guarda corta antes del UPDATE.
    expect(ds.query.mock.calls.some(([sql]: any[]) => sql.includes("SET estado='cancelado'"))).toBe(false);
  });

  // Regresión del hueco real: antes de este fix, esto NO lanzaba nada — un
  // préstamo con pagos ya cobrados quedaba "cancelado" (resta
  // prestamosActivos al deudor) sin anular ni reversar esos pagos, y sin
  // ninguna de las salvaguardas que sí tiene PagosService.anular().
  it('con pagos ya registrados (totalPagado > 0): se rechaza, no se puede cancelar', async () => {
    const { svc, ds } = buildService(mockOrFail({ ...PRESTAMO_BASE, totalPagado: 500 }));
    await expect(svc.cancelar(7, 40, 'motivo')).rejects.toThrow(BadRequestException);
    await expect(svc.cancelar(7, 40, 'motivo')).rejects.toThrow(/pagos registrados/);
    expect(ds.query.mock.calls.some(([sql]: any[]) => sql.includes("SET estado='cancelado'"))).toBe(false);
  });
});
