/**
 * Bloque 2 — recibos-cobro.service.ts:crear() etiqueta el asiento de cobro
 * por el id propio del PagoCobrado creado, no por el de la CxC.
 *
 * Antes, dos recibos sobre la misma CxC generaban dos asientos con el MISMO
 * referenciaId (cxc.id) — imposible de distinguir para revertirAsiento().
 * Ahora cada asiento apunta al pago que lo originó.
 */

import { RecibosCobrosService } from './recibos-cobro.service';
import { EstadoCuenta } from '../common/enums/estado-cuenta.enum';

function makeService(opts: {
  cxc: any;
  pagoGuardadoId: number;
}) {
  const repo = {
    create: jest.fn((data: any) => data),
    save:   jest.fn(async (data: any) => ({ id: 555, numero: 'REC-00001', ...data })),
  };
  const cxcRepo = { findOne: jest.fn().mockResolvedValue(opts.cxc) };
  const facturaRepo = { findOne: jest.fn().mockResolvedValue(null) };
  const anticipoRepo = {};

  const pagoRepoEm = {
    create: jest.fn((data: any) => data),
    save:   jest.fn(async (data: any) => ({ id: opts.pagoGuardadoId, ...data })),
  };
  const cxcRepoEm    = { update: jest.fn().mockResolvedValue({}) };
  const facturaRepoEm = { update: jest.fn().mockResolvedValue({}) };

  const em = {
    getRepository: (entity: any) => {
      if (entity?.name === 'PagoCobrado')     return pagoRepoEm;
      if (entity?.name === 'CuentaPorCobrar') return cxcRepoEm;
      if (entity?.name === 'Factura')         return facturaRepoEm;
      throw new Error(`Entidad no mockeada: ${entity?.name}`);
    },
  };

  const dataSource = {
    query: jest.fn().mockResolvedValue([{ numero: 1 }]),
    transaction: jest.fn(async (cb: any) => cb(em)),
  };

  const asientosService = { asientoCobro: jest.fn().mockResolvedValue(undefined) };
  const tesoreriaService = { registrarMovimientoAutomatico: jest.fn().mockResolvedValue(undefined) };
  const tenantSvc = { getEmpresaId: () => opts.cxc.empresaId };

  const svc: any = Object.create(RecibosCobrosService.prototype);
  svc.logger           = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
  svc.repo             = repo;
  svc.cxcRepo          = cxcRepo;
  svc.facturaRepo      = facturaRepo;
  svc.anticipoRepo     = anticipoRepo;
  svc.dataSource       = dataSource;
  svc.asientosService  = asientosService;
  svc.tesoreriaService = tesoreriaService;
  svc.tenantSvc        = tenantSvc;
  return { svc, asientosService, pagoRepoEm };
}

describe('RecibosCobrosService.crear — asiento etiquetado por el pago, no por la CxC', () => {
  it('asientoCobro recibe el id del PagoCobrado recién creado, no el de la CxC', async () => {
    const cxc = {
      id: 47, empresaId: 7, clienteId: 3, estado: EstadoCuenta.PENDIENTE,
      montoPendiente: 400, montoPagado: 0, montoOriginal: 400, moneda: 'DOP', tipoCambio: 1,
    };
    const { svc, asientosService, pagoRepoEm } = makeService({ cxc, pagoGuardadoId: 777 });

    await svc.crear({
      cxcId: 47, monto: 400, metodoPago: 'efectivo', concepto: 'Cobro',
      clienteNombre: 'Cliente de prueba',
    }, 5);

    expect(pagoRepoEm.save).toHaveBeenCalled();
    // El 2do argumento es el id del PAGO (777), el 3ro el de la CxC (47) — NO al revés.
    expect(asientosService.asientoCobro).toHaveBeenCalledWith(400, 777, 47, 5);
  });
});
