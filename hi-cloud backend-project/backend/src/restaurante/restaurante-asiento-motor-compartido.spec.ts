/**
 * RestauranteService.cobrarComanda() — asiento vía el motor compartido
 * (2026-09-19). Antes armaba el asiento con SQL crudo directo a
 * asientos_contables/asiento_lineas, con userId fijo en 1 (nunca el usuario
 * real que cobró) y cuentas hardcodeadas. Cobertura: delega en
 * AsientosAutomaticosService.asientoVentaRestaurante con los montos
 * correctos y el userId real, y ya no toca esas tablas directamente.
 */

import { RestauranteService } from './restaurante.service';

const COMANDA = {
  id: 55, numero: 'COM-0055', estado: 'lista', subtotal: 100, descuento: 0,
  mesaId: 3, clienteId: null, meseroId: null, meseroNombre: null,
};

function makeService() {
  const queryLog: string[] = [];
  const qr = {
    connect: jest.fn().mockResolvedValue(undefined),
    startTransaction: jest.fn().mockResolvedValue(undefined),
    commitTransaction: jest.fn().mockResolvedValue(undefined),
    rollbackTransaction: jest.fn().mockResolvedValue(undefined),
    release: jest.fn().mockResolvedValue(undefined),
    query: jest.fn((sql: string) => {
      queryLog.push(sql);
      if (sql.includes('siguiente_numero_secuencia')) return Promise.resolve([{ numero: 999 }]);
      if (sql.includes('INSERT INTO facturas')) return Promise.resolve([{ id: 777 }]);
      return Promise.resolve([]);
    }),
  };
  const ds: any = {
    createQueryRunner: () => qr,
    query: jest.fn((sql: string) => {
      queryLog.push(sql);
      return Promise.resolve([]);
    }),
  };
  const tenantSvc: any = { getEmpresaId: () => 7, getUserId: () => 42, getSucursalId: () => null };
  const vendedorResolver: any = { resolverVendedor: jest.fn().mockResolvedValue({ vendedorId: 3, nombreVendedor: 'Ana' }) };
  const asientosService: any = { asientoVentaRestaurante: jest.fn().mockResolvedValue(undefined) };

  const svc: any = Object.create(RestauranteService.prototype);
  svc.logger            = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
  svc.ds                = ds;
  svc.tenantSvc         = tenantSvc;
  svc.vendedorResolver  = vendedorResolver;
  svc.asientosService   = asientosService;
  svc.obtenerComanda    = jest.fn().mockResolvedValue(COMANDA);
  svc._actualizarTurnoActivo = jest.fn().mockResolvedValue(undefined);

  return { svc: svc as RestauranteService, asientosService, queryLog };
}

describe('RestauranteService.cobrarComanda() — asiento vía el motor compartido', () => {
  it('delega en asientosService.asientoVentaRestaurante con los montos y el userId REAL (no 1 fijo)', async () => {
    const { svc, asientosService } = makeService();

    await svc.cobrarComanda(55, { metodoPago: 'efectivo' });
    await new Promise(process.nextTick); // el asiento es fire-and-forget

    expect(asientosService.asientoVentaRestaurante).toHaveBeenCalledTimes(1);
    const args = asientosService.asientoVentaRestaurante.mock.calls[0];
    expect(args[0]).toBe(55);          // comandaId
    expect(args[1]).toBe('COM-0055');  // comandaNumero
    expect(args[5]).toBe('efectivo');  // metodoPago
    expect(args[7]).toBe(42);          // userId REAL — antes el SQL crudo lo fijaba en 1
  });

  it('ya no inserta directamente en asientos_contables/asiento_lineas', async () => {
    const { svc, queryLog } = makeService();

    await svc.cobrarComanda(55, { metodoPago: 'tarjeta' });
    await new Promise(process.nextTick);

    expect(queryLog.some(q => q.includes('INSERT INTO asientos_contables'))).toBe(false);
    expect(queryLog.some(q => q.includes('INSERT INTO asiento_lineas'))).toBe(false);
  });
});
