/**
 * Bloque 2 — CxPService.registrarPago() etiqueta el asiento de pago por el
 * id del PagoRealizado creado, no por el id de la CxP.
 */

import { CxPService } from './cxp.service';
import { EstadoCuenta } from '../common/enums/estado-cuenta.enum';

function makeService(cuenta: any, pagoGuardadoId: number) {
  const cxpRepository = {
    findOne: jest.fn().mockResolvedValue(cuenta),
    update:  jest.fn().mockResolvedValue({}),
  };
  const pagoRepository = {
    create: jest.fn((data: any) => data),
    save:   jest.fn(async (data: any) => ({ id: pagoGuardadoId, ...data })),
  };
  const compraRepository = { update: jest.fn().mockResolvedValue({}) };

  const asientosService = {
    asientoPago:   jest.fn().mockResolvedValue(undefined),
    asientoPagoME: jest.fn().mockResolvedValue(undefined),
  };
  const tesoreriaService = { registrarMovimientoAutomatico: jest.fn().mockResolvedValue(undefined) };
  const realtimeService  = { notify: jest.fn() };
  const tenantService    = { getEmpresaId: () => cuenta.empresaId };

  const svc: any = Object.create(CxPService.prototype);
  svc.logger           = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
  svc.cxpRepository     = cxpRepository;
  svc.pagoRepository    = pagoRepository;
  svc.compraRepository  = compraRepository;
  svc.asientosService   = asientosService;
  svc.tesoreriaService  = tesoreriaService;
  svc.realtimeService   = realtimeService;
  svc.tenantService     = tenantService;
  return { svc, asientosService, pagoRepository };
}

describe('CxPService.registrarPago — asiento etiquetado por el pago, no por la CxP', () => {
  it('asientoPago recibe el id del pago recién creado (DOP)', async () => {
    const cuenta = {
      id: 30, empresaId: 7, estado: EstadoCuenta.PENDIENTE,
      montoPendiente: 300, montoPagado: 0, montoOriginal: 300, moneda: 'DOP', tipoCambio: 1, compraId: 20,
    };
    const { svc, asientosService } = makeService(cuenta, 700);

    await svc.registrarPago(30, { monto: 300, metodoPago: 'efectivo' }, 5);

    expect(asientosService.asientoPago).toHaveBeenCalledWith(300, 700, 30, 5);
  });

  it('asientoPagoME recibe el id del pago recién creado (moneda extranjera)', async () => {
    const cuenta = {
      id: 31, empresaId: 7, estado: EstadoCuenta.PENDIENTE,
      montoPendiente: 50, montoPagado: 0, montoOriginal: 50, moneda: 'USD', tipoCambio: 58, compraId: 21,
    };
    const { svc, asientosService } = makeService(cuenta, 701);

    await svc.registrarPago(31, { monto: 50, metodoPago: 'efectivo', tipoCambio: 59 }, 5);

    expect(asientosService.asientoPagoME).toHaveBeenCalledWith(50, 'USD', 59, 58, 701, 31, 5);
  });
});
