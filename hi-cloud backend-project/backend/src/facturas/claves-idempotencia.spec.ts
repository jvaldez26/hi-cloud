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

/**
 * FacturasService.porClaveIdempotencia — endpoint de SOLO LECTURA que usa el
 * banner de borrador recuperado (frontend) para decidir si ofrece "Restaurar"
 * o "Ya se guardó como FAC-XXXX", SIN reintentar nunca el POST para saberlo.
 */
describe('FacturasService — porClaveIdempotencia', () => {
  const makeService = (factura: unknown, ecf: unknown = null) => {
    const findOneFactura = jest.fn().mockResolvedValue(factura);
    const findOneEcf     = jest.fn().mockResolvedValue(ecf);
    const ctx = {
      tenantService:     { getEmpresaId: () => 7 },
      facturaRepository: { findOne: findOneFactura },
      ecfRepo:            { findOne: findOneEcf },
      buscarPorClaveIdempotencia: (FacturasService.prototype as any).buscarPorClaveIdempotencia,
    };
    const call = (clave: string) => (FacturasService.prototype as any).porClaveIdempotencia.call(ctx, clave);
    return { call, findOneFactura, findOneEcf };
  };

  it('sin factura para esa clave, devuelve existe:false', async () => {
    const { call } = makeService(null);
    await expect(call('no-existe')).resolves.toEqual({ existe: false });
  });

  it('con factura pero sin e-CF emitido todavía, devuelve eNcf:null (nunca consulta ecfRepo)', async () => {
    const factura = { id: 42, folio: 'FAC-100', ecfId: undefined };
    const { call, findOneEcf } = makeService(factura);
    await expect(call('abc')).resolves.toEqual({ existe: true, id: 42, folio: 'FAC-100', eNcf: null });
    expect(findOneEcf).not.toHaveBeenCalled();
  });

  it('con factura y e-CF ya vinculado, devuelve el número de comprobante', async () => {
    const factura = { id: 42, folio: 'FAC-100', ecfId: 900 };
    const ecf = { id: 900, numero: 'E320000000045' };
    const { call, findOneEcf } = makeService(factura, ecf);
    await expect(call('abc')).resolves.toEqual({ existe: true, id: 42, folio: 'FAC-100', eNcf: 'E320000000045' });
    expect(findOneEcf).toHaveBeenCalledWith({ where: { id: 900 } });
  });
});
