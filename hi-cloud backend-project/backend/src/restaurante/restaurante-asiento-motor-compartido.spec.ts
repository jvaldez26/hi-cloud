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
      // Un solo item de RD$100 (sin ITBIS declarado — se calcula 18% abajo:
      // subtotalFac=100, ivaFac=18, totalFac=118) para que formasPago tenga
      // un monto real que verificar, no 0.
      if (sql.includes('FROM rs_comanda_items')) {
        return Promise.resolve([{ cantidad: 1, precioUnitario: 100, descuento: 0, total: 100, nombre: 'Plato' }]);
      }
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

/**
 * Hotfix 2026-10-07 — el INSERT crudo a facturas ponía tipoPago='CONTADO'
 * pero NUNCA incluía formasPago: la comanda SÍ sabe cómo se cobró
 * (dto.metodoPago) pero la factura quedaba sin ningún rastro de cobro — el
 * mismo hueco que confirma sellar-factura-pagada.helper.ts. Ahora mapea
 * metodoPago → tipo DGII (1=efectivo, 3=tarjeta, 2=transferencia) y lo manda
 * en la factura, con monto = total.
 */
describe('RestauranteService.cobrarComanda() — formasPago en la factura (antes faltaba)', () => {
  function capturarInsertFactura(svc: any) {
    const qr = (svc.ds as any).createQueryRunner();
    return () => qr.query.mock.calls.find((c: any[]) => typeof c[0] === 'string' && c[0].includes('INSERT INTO facturas'));
  }

  it('efectivo → formasPago con tipo DGII 1 y monto = total', async () => {
    const { svc } = makeService();
    const insertCall = capturarInsertFactura(svc);

    await svc.cobrarComanda(55, { metodoPago: 'efectivo' });
    await new Promise(process.nextTick);

    const call = insertCall()!;
    expect(call[0]).toContain('"formasPago"');
    const params = call[1] as any[];
    const formasPagoJson = params[params.length - 1]; // último parámetro — ver el orden del INSERT
    expect(JSON.parse(formasPagoJson)).toEqual([{ tipo: 1, monto: 118 }]); // 100 + 18% ITBIS, ver el item del fixture
  });

  it('tarjeta → tipo DGII 3', async () => {
    const { svc } = makeService();
    const insertCall = capturarInsertFactura(svc);

    await svc.cobrarComanda(55, { metodoPago: 'tarjeta' });
    await new Promise(process.nextTick);

    const params = insertCall()![1] as any[];
    const formasPago = JSON.parse(params[params.length - 1]);
    expect(formasPago[0].tipo).toBe(3);
  });

  it('transferencia → tipo DGII 2', async () => {
    const { svc } = makeService();
    const insertCall = capturarInsertFactura(svc);

    await svc.cobrarComanda(55, { metodoPago: 'transferencia' });
    await new Promise(process.nextTick);

    const params = insertCall()![1] as any[];
    const formasPago = JSON.parse(params[params.length - 1]);
    expect(formasPago[0].tipo).toBe(2);
  });
});
