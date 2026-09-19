/**
 * Bloque 2 — CxCService.registrarPago() (pago directo, sin recibo) etiqueta
 * el asiento de cobro por el id del PagoCobrado creado dentro de su propia
 * transacción, no por el id de la CxC.
 */

import { CxCService } from './cxc.service';
import { EstadoCuenta } from '../common/enums/estado-cuenta.enum';

function makeService(cuenta: any, pagoGuardadoId: number) {
  const cxcRepository = { findOne: jest.fn().mockResolvedValue(cuenta) };

  const pagoRepoEm = {
    create: jest.fn((data: any) => data),
    save:   jest.fn(async (data: any) => ({ id: pagoGuardadoId, ...data })),
  };
  const cxcRepoEm      = { update: jest.fn().mockResolvedValue({}) };
  const facturaRepoEm  = { update: jest.fn().mockResolvedValue({}) };

  const em = {
    getRepository: (entity: any) => {
      if (entity?.name === 'PagoCobrado')     return pagoRepoEm;
      if (entity?.name === 'CuentaPorCobrar') return cxcRepoEm;
      if (entity?.name === 'Factura')         return facturaRepoEm;
      throw new Error(`Entidad no mockeada: ${entity?.name}`);
    },
    query: jest.fn().mockResolvedValue([{ n: 1 }]),
  };

  const dataSource = {
    transaction: jest.fn(async (cb: any) => cb(em)),
  };

  const asientosService  = {
    asientoCobro:   jest.fn().mockResolvedValue(undefined),
    asientoCobroME: jest.fn().mockResolvedValue(undefined),
  };
  const tesoreriaService = { registrarMovimientoAutomatico: jest.fn().mockResolvedValue(undefined) };
  const realtimeService  = { notify: jest.fn() };
  const tenantService    = { getEmpresaId: () => cuenta.empresaId };

  const svc: any = Object.create(CxCService.prototype);
  svc.logger           = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
  svc.cxcRepository     = cxcRepository;
  svc.dataSource        = dataSource;
  svc.asientosService   = asientosService;
  svc.tesoreriaService  = tesoreriaService;
  svc.realtimeService   = realtimeService;
  svc.tenantService     = tenantService;
  return { svc, asientosService, pagoRepoEm };
}

describe('CxCService.registrarPago — asiento etiquetado por el pago, no por la CxC', () => {
  it('asientoCobro recibe el id del pago recién creado (DOP)', async () => {
    const cuenta = {
      id: 47, empresaId: 7, estado: EstadoCuenta.PENDIENTE,
      montoPendiente: 400, montoPagado: 0, montoOriginal: 400, moneda: 'DOP', tipoCambio: 1,
    };
    const { svc, asientosService } = makeService(cuenta, 888);

    await svc.registrarPago(47, { monto: 400, metodoPago: 'efectivo' }, 5);

    expect(asientosService.asientoCobro).toHaveBeenCalledWith(400, 888, 47, expect.any(String), 5, undefined, false);
  });

  it('asientoCobroME recibe el id del pago recién creado (moneda extranjera)', async () => {
    const cuenta = {
      id: 48, empresaId: 7, estado: EstadoCuenta.PENDIENTE,
      montoPendiente: 100, montoPagado: 0, montoOriginal: 100, moneda: 'USD', tipoCambio: 58,
    };
    const { svc, asientosService } = makeService(cuenta, 889);

    await svc.registrarPago(48, { monto: 100, metodoPago: 'efectivo', tipoCambio: 59 }, 5);

    expect(asientosService.asientoCobroME).toHaveBeenCalledWith(100, 'USD', 59, 58, 889, 48, expect.any(String), 5);
  });
});

describe('CxCService — selector de cuenta contable (cuentaContrapartida, 2026-09-19)', () => {
  it('con cuentaContrapartida elegida: la pasa al motor y la marca manual', async () => {
    const cuenta = {
      id: 47, empresaId: 7, estado: EstadoCuenta.PENDIENTE,
      montoPendiente: 400, montoPagado: 0, montoOriginal: 400, moneda: 'DOP', tipoCambio: 1,
    };
    const { svc, asientosService } = makeService(cuenta, 888);

    await svc.registrarPago(47, { monto: 400, metodoPago: 'efectivo', cuentaContrapartida: '1.1.1.02' }, 5);

    expect(asientosService.asientoCobro).toHaveBeenCalledWith(400, 888, 47, expect.any(String), 5, '1.1.1.02', true);
  });

  it('previsualizarAsiento() delega en el motor sin registrar el pago', async () => {
    const cuenta = {
      id: 47, empresaId: 7, estado: EstadoCuenta.PENDIENTE,
      montoPendiente: 400, montoPagado: 0, montoOriginal: 400, moneda: 'DOP', tipoCambio: 1,
    };
    const asientosService = {
      previsualizarCobro: jest.fn().mockResolvedValue({ ok: true, lineas: [], totalDebe: 400, totalHaber: 400, cuadrado: true }),
    };
    const svc: any = Object.create(CxCService.prototype);
    svc.cxcRepository  = { findOne: jest.fn().mockResolvedValue(cuenta) };
    svc.asientosService = asientosService;
    svc.tenantService  = { getEmpresaId: () => 7 };

    const r = await svc.previsualizarAsiento(47, 400, '1.1.1.02');

    expect(r.ok).toBe(true);
    expect(asientosService.previsualizarCobro).toHaveBeenCalledWith(400, 0, 47, '1.1.1.02');
  });

  it('previsualizarAsiento() en moneda extranjera: avisa que no está disponible, no llama al motor', async () => {
    const cuenta = {
      id: 48, empresaId: 7, estado: EstadoCuenta.PENDIENTE,
      montoPendiente: 100, montoPagado: 0, montoOriginal: 100, moneda: 'USD', tipoCambio: 58,
    };
    const asientosService = { previsualizarCobro: jest.fn() };
    const svc: any = Object.create(CxCService.prototype);
    svc.cxcRepository  = { findOne: jest.fn().mockResolvedValue(cuenta) };
    svc.asientosService = asientosService;
    svc.tenantService  = { getEmpresaId: () => 7 };

    const r = await svc.previsualizarAsiento(48, 100);

    expect(r.ok).toBe(false);
    expect(r.error).toContain('USD');
    expect(asientosService.previsualizarCobro).not.toHaveBeenCalled();
  });
});
