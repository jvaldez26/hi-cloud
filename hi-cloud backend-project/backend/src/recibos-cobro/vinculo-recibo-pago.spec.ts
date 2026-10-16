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
      // resolverCajaDiariaAbierta() (EFECTIVO) consulta cierres_caja/vendedores.
      query: jest.fn((sql: string) => {
        if (sql.includes('cierres_caja')) return Promise.resolve([{ id: 900 }]);
        if (sql.includes('vendedores'))   return Promise.resolve([]);
        return Promise.resolve([{ numero: 1 }]);
      }),
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

describe('RecibosCobrosService.eliminar — revierte por los pagos reales (reciboCobroId), no por notas ni por un solo cxcId', () => {
  it('busca los pagos por reciboCobroId y desactiva cada uno por su propio id', async () => {
    const recibo = { id: 42, numero: 'REC-00042', monto: 1000, cxcId: 8, usuarioId: 5 };
    const cxc = {
      id: 8, empresaId: 7, montoPagado: 1000, montoOriginal: 1000, montoPendiente: 0, facturaId: 90,
    };
    const pago = { id: 300, cuentaPorCobrarId: 8, monto: 1000, isActive: true, reciboCobroId: 42 };

    const repo = { findOne: jest.fn().mockResolvedValue(recibo), update: jest.fn().mockResolvedValue({}) };
    const cxcRepo = { findOne: jest.fn().mockResolvedValue(cxc) };
    const pagoRepo = { find: jest.fn().mockResolvedValue([pago]) };

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
    svc.pagoRepo        = pagoRepo;
    svc.dataSource      = dataSource;
    svc.asientosService = asientosService;
    svc.tenantSvc       = tenantSvc;

    await svc.eliminar(42);

    expect(pagoRepo.find).toHaveBeenCalledWith({ where: { reciboCobroId: 42, isActive: true } });
    expect(pagoRepoEm.update).toHaveBeenCalledWith(300, { isActive: false });
    // El recibo queda inactivo — listar() lo sigue mostrando pero marcado.
    expect(repo.update).toHaveBeenCalledWith(42, { isActive: false });
  });

  it('un recibo que pagó VARIAS CxC (FIFO) revierte cada una por su propio monto, no por el total del recibo', async () => {
    const recibo = { id: 99, numero: 'REC-00099', monto: 685, cxcId: 1, usuarioId: 5 };
    const cxcA = { id: 1, empresaId: 7, montoPagado: 115, montoOriginal: 115, montoPendiente: 0, facturaId: 10 };
    const cxcB = { id: 2, empresaId: 7, montoPagado: 570, montoOriginal: 570, montoPendiente: 0, facturaId: 20 };
    const pagos = [
      { id: 301, cuentaPorCobrarId: 1, monto: 115, isActive: true, reciboCobroId: 99 },
      { id: 302, cuentaPorCobrarId: 2, monto: 570, isActive: true, reciboCobroId: 99 },
    ];

    const repo = { findOne: jest.fn().mockResolvedValue(recibo), update: jest.fn().mockResolvedValue({}) };
    const cxcRepo = {
      findOne: jest.fn().mockImplementation(({ where }: any) =>
        Promise.resolve(where.id === 1 ? cxcA : where.id === 2 ? cxcB : null)),
    };
    const pagoRepo = { find: jest.fn().mockResolvedValue(pagos) };
    const cxcRepoEm = { update: jest.fn().mockResolvedValue({}) };
    const em = {
      getRepository: (entity: any) => {
        if (entity?.name === 'PagoCobrado')     return { update: jest.fn().mockResolvedValue({}) };
        if (entity?.name === 'CuentaPorCobrar') return cxcRepoEm;
        if (entity?.name === 'Factura')         return { update: jest.fn().mockResolvedValue({}) };
        throw new Error(`Entidad no mockeada: ${entity?.name}`);
      },
    };
    const dataSource = { transaction: jest.fn(async (cb: any) => cb(em)) };
    const asientosService = { asientoReversion: jest.fn().mockResolvedValue(undefined) };
    const tenantSvc = { getEmpresaId: () => 7 };

    const svc: any = Object.create(RecibosCobrosService.prototype);
    svc.logger          = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
    svc.repo            = repo;
    svc.cxcRepo         = cxcRepo;
    svc.pagoRepo        = pagoRepo;
    svc.dataSource      = dataSource;
    svc.asientosService = asientosService;
    svc.tenantSvc       = tenantSvc;

    await svc.eliminar(99);

    // Cada CxC se revierte por SU PROPIO monto pagado, no por 685 completos.
    expect(cxcRepoEm.update).toHaveBeenCalledWith(1, expect.objectContaining({ montoPagado: 0, montoPendiente: 115 }));
    expect(cxcRepoEm.update).toHaveBeenCalledWith(2, expect.objectContaining({ montoPagado: 0, montoPendiente: 570 }));
    expect(asientosService.asientoReversion).toHaveBeenCalledWith(115, 1, 99, 'recibo', expect.any(String), 5);
    expect(asientosService.asientoReversion).toHaveBeenCalledWith(570, 2, 99, 'recibo', expect.any(String), 5);
  });
});
