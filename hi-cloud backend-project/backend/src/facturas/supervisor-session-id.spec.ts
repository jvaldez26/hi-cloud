import { FacturasService } from './facturas.service';

/**
 * FacturasService.resolverSupervisorSessionId — vínculo de auditoría entre
 * una venta y la sesión de modo supervisor activa al crearla (ver
 * supervisor-log.spec.ts para el lado de AuthService). Es metadata, no
 * autorización: una sesión inválida/de otra empresa/vencida se ignora en
 * silencio, nunca bloquea la venta — mismo criterio que
 * permitirVentaBajoCosto (fail-safe hacia adelante). Método privado
 * probado vía `.call({...})`, mismo patrón que costo-venta-validacion.spec.ts.
 */
describe('FacturasService — resolverSupervisorSessionId', () => {
  const makeService = (rows: unknown[]) => {
    const query = jest.fn().mockResolvedValue(rows);
    const ctx = { dataSource: { query } };
    const call = (supervisorSessionId: number | undefined, empresaId: number) =>
      (FacturasService.prototype as any).resolverSupervisorSessionId.call(ctx, supervisorSessionId, empresaId);
    return { call, query };
  };

  it('undefined si no viene sessionId (venta sin modo supervisor activo)', async () => {
    const { call, query } = makeService([]);
    await expect(call(undefined, 7)).resolves.toBeUndefined();
    expect(query).not.toHaveBeenCalled(); // ni siquiera consulta — nada que validar
  });

  it('devuelve el id cuando la sesión existe, es de la misma empresa y está dentro de las 8h', async () => {
    const { call, query } = makeService([{ id: 42 }]);
    await expect(call(42, 7)).resolves.toBe(42);
    expect(query.mock.calls[0][1]).toEqual([42, 7]);
  });

  it('undefined si la sesión no existe / es de otra empresa / ya expiró — nunca bloquea la venta', async () => {
    const { call } = makeService([]); // la query no devuelve fila: no cumple empresaId/ventana/sessionId-null
    await expect(call(999, 7)).resolves.toBeUndefined();
  });
});
