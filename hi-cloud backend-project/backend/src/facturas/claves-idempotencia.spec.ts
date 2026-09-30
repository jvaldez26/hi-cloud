import { FacturasService } from './facturas.service';

/**
 * FacturasService.buscarPorClaveIdempotencia — evita facturas duplicadas
 * cuando el mismo intento de cobro llega dos veces (doble clic, reintento de
 * red, o el POS retomando un borrador cuya emisión falló la vez pasada).
 * Método privado probado vía `.call({...})`, mismo patrón que
 * supervisor-session-id.spec.ts.
 */
describe('FacturasService — buscarPorClaveIdempotencia', () => {
  const makeService = (row: unknown) => {
    const findOne = jest.fn().mockResolvedValue(row);
    const ctx = { facturaRepository: { findOne } };
    const call = (claveIdempotencia: string | undefined, empresaId: number) =>
      (FacturasService.prototype as any).buscarPorClaveIdempotencia.call(ctx, claveIdempotencia, empresaId);
    return { call, findOne };
  };

  it('sin clave, no busca nada — la mayoría de los caminos a create() todavía no la mandan', async () => {
    const { call, findOne } = makeService(null);
    await expect(call(undefined, 7)).resolves.toBeNull();
    expect(findOne).not.toHaveBeenCalled();
  });

  it('con clave y sin factura existente, devuelve null (create() sigue su camino normal)', async () => {
    const { call } = makeService(null);
    await expect(call('11111111-1111-1111-1111-111111111111', 7)).resolves.toBeNull();
  });

  it('con clave y factura existente PARA ESTA EMPRESA, la devuelve — la reutiliza en vez de crear otra', async () => {
    const factura = { id: 42, folio: 'FAC-100', empresaId: 7, claveIdempotencia: 'abc' };
    const { call, findOne } = makeService(factura);
    await expect(call('abc', 7)).resolves.toBe(factura);
    expect(findOne.mock.calls[0][0]).toEqual({ where: { empresaId: 7, claveIdempotencia: 'abc' } });
  });
});
