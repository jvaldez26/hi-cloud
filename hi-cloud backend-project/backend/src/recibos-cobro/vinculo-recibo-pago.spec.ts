/**
 * 2026-09-22 — reciboCobroId, el vínculo real entre recibos_cobro y
 * pagos_cobrados (migración 1766800000000-AgregarReciboCobroIdPagosCobrados).
 *
 * Antes de esto, "Nuevo Recibo" contra una CxC escribía un REC- y un RDP-
 * para el mismo cobro sin ninguna FK entre ellos — el único vínculo era texto
 * libre en pagos_cobrados.notas ("Recibo REC-xxx"), que listar(), eliminar()
 * y cxc.service.ts tenían que adivinar con una regex o un LIKE con comodín
 * (con riesgo real: 'Recibo REC-101%' también matchea REC-1010). Este archivo
 * prueba que crear() escribe la FK y que eliminar() la usa para desactivar
 * el pago correcto — no el texto.
 */

import { RecibosCobrosService } from './recibos-cobro.service';
import { EstadoCuenta } from '../common/enums/estado-cuenta.enum';

describe('RecibosCobrosService.crear — enlaza el pago al recibo por FK', () => {
  it('el PagoCobrado se crea con reciboCobroId = id del recibo recién guardado', async () => {
    const cxc = {
      id: 47, empresaId: 7, clienteId: 3, estado: EstadoCuenta.PENDIENTE,
      montoPendiente: 400, montoPagado: 0, montoOriginal: 400, moneda: 'DOP', tipoCambio: 1,
    };
    const repo = {
      create: jest.fn((data: any) => data),
      save:   jest.fn(async (data: any) => ({ id: 555, numero: 'REC-00001', ...data })),
    };
    const cxcRepo = { findOne: jest.fn().mockResolvedValue(cxc) };
    const facturaRepo = { findOne: jest.fn().mockResolvedValue(null) };

    const pagoRepoEm = {
      create: jest.fn((data: any) => data),
      save:   jest.fn(async (data: any) => ({ id: 900, ...data })),
    };
    const em = {
      getRepository: (entity: any) => {
        if (entity?.name === 'PagoCobrado')     return pagoRepoEm;
        if (entity?.name === 'CuentaPorCobrar') return { update: jest.fn().mockResolvedValue({}) };
        if (entity?.name === 'Factura')         return { update: jest.fn().mockResolvedValue({}) };
        throw new Error(`Entidad no mockeada: ${entity?.name}`);
      },
    };
    const dataSource = {
      query: jest.fn().mockResolvedValue([{ numero: 1 }]),
      transaction: jest.fn(async (cb: any) => cb(em)),
    };
    const asientosService  = { asientoCobro: jest.fn().mockResolvedValue(undefined) };
    const tesoreriaService = { registrarMovimientoAutomatico: jest.fn().mockResolvedValue(undefined) };
    const tenantSvc = { getEmpresaId: () => cxc.empresaId };

    const svc: any = Object.create(RecibosCobrosService.prototype);
    svc.logger           = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
    svc.repo             = repo;
    svc.cxcRepo          = cxcRepo;
    svc.facturaRepo      = facturaRepo;
    svc.anticipoRepo     = {};
    svc.dataSource       = dataSource;
    svc.asientosService  = asientosService;
    svc.tesoreriaService = tesoreriaService;
    svc.tenantSvc        = tenantSvc;

    await svc.crear({
      cxcId: 47, monto: 400, metodoPago: 'efectivo', concepto: 'Cobro',
      clienteNombre: 'Cliente de prueba',
    }, 5);

    expect(pagoRepoEm.create).toHaveBeenCalledWith(
      expect.objectContaining({ reciboCobroId: 555 }),
    );
  });
});

describe('RecibosCobrosService.eliminar — desactiva el pago por reciboCobroId, no por notas', () => {
  it('el update de PagoCobrado filtra por reciboCobroId = id del recibo anulado', async () => {
    const recibo = { id: 42, numero: 'REC-00042', monto: 1000, cxcId: 8, usuarioId: 5 };
    const cxc = {
      id: 8, empresaId: 7, montoPagado: 1000, montoOriginal: 1000, montoPendiente: 0, facturaId: 90,
    };

    const repo = { findOne: jest.fn().mockResolvedValue(recibo), update: jest.fn().mockResolvedValue({}) };
    const cxcRepo = { findOne: jest.fn().mockResolvedValue(cxc) };

    const pagoRepoEm = { update: jest.fn().mockResolvedValue({}) };
    const em = {
      getRepository: (entity: any) => {
        if (entity?.name === 'PagoCobrado')     return pagoRepoEm;
        if (entity?.name === 'CuentaPorCobrar') return { update: jest.fn().mockResolvedValue({}) };
        if (entity?.name === 'Factura')         return { update: jest.fn().mockResolvedValue({}) };
        throw new Error(`Entidad no mockeada: ${entity?.name}`);
      },
    };
    const dataSource = { transaction: jest.fn(async (cb: any) => cb(em)) };
    const asientosService = { asientoReversion: jest.fn().mockResolvedValue(undefined) };
    const tenantSvc = { getEmpresaId: () => cxc.empresaId };

    const svc: any = Object.create(RecibosCobrosService.prototype);
    svc.logger          = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
    svc.repo            = repo;
    svc.cxcRepo         = cxcRepo;
    svc.dataSource      = dataSource;
    svc.asientosService = asientosService;
    svc.tenantSvc       = tenantSvc;

    await svc.eliminar(42);

    expect(pagoRepoEm.update).toHaveBeenCalledWith(
      { reciboCobroId: 42, isActive: true },
      { isActive: false },
    );
    // El recibo queda inactivo — listar() lo sigue mostrando pero marcado.
    expect(repo.update).toHaveBeenCalledWith(42, { isActive: false });
  });
});
