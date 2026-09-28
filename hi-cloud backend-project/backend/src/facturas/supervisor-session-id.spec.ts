import { BadRequestException } from '@nestjs/common';
import { FacturasService } from './facturas.service';

/**
 * FacturasService.resolverSupervisorSessionId — vínculo de auditoría entre
 * una venta y la sesión de modo supervisor activa al crearla (ver
 * supervisor-log.spec.ts para el lado de AuthService).
 *
 * Sin sessionId en el DTO, no valida nada — decidir CUÁNDO hace falta
 * supervisor sigue siendo criterio del frontend. Pero si el DTO SÍ trae un
 * sessionId (el frontend declaró que esta venta necesitaba autorización),
 * ahora se verifica de verdad: una sesión inexistente/de otra
 * empresa/vencida RECHAZA la venta — antes se ignoraba en silencio, lo que
 * dejaba pasar un carrito recuperado con un precio/descuento autorizado por
 * una sesión de supervisor ya vencida hace rato. Método privado probado vía
 * `.call({...})`, mismo patrón que costo-venta-validacion.spec.ts.
 */
describe('FacturasService — resolverSupervisorSessionId', () => {
  const makeService = (rows: unknown[]) => {
    const query = jest.fn().mockResolvedValue(rows);
    const ctx = { dataSource: { query } };
    const call = (supervisorSessionId: number | undefined, empresaId: number) =>
      (FacturasService.prototype as any).resolverSupervisorSessionId.call(ctx, supervisorSessionId, empresaId);
    return { call, query };
  };

  it('undefined si no viene sessionId (venta sin modo supervisor activo) — no valida nada', async () => {
    const { call, query } = makeService([]);
    await expect(call(undefined, 7)).resolves.toBeUndefined();
    expect(query).not.toHaveBeenCalled(); // ni siquiera consulta — nada que validar
  });

  it('devuelve el id cuando la sesión existe, es de la misma empresa y está dentro de las 8h', async () => {
    const { call, query } = makeService([{ id: 42 }]);
    await expect(call(42, 7)).resolves.toBe(42);
    expect(query.mock.calls[0][1]).toEqual([42, 7]);
  });

  it('RECHAZA la venta si la sesión declarada no existe / es de otra empresa / ya expiró', async () => {
    const { call } = makeService([]); // la query no devuelve fila: no cumple empresaId/ventana/sessionId-null
    await expect(call(999, 7)).rejects.toThrow(BadRequestException);
  });

  it('el mensaje de rechazo le dice al cajero qué hacer (pedir nueva autorización)', async () => {
    const { call } = makeService([]);
    await expect(call(999, 7)).rejects.toThrow(/nueva autorización/);
  });
});
