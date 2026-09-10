/**
 * Simetría Compra + Nota de Crédito de Compra.
 *
 * asientoNotaCreditoCompra() invierte el criterio de cuentas de
 * asientoCompraRecibida (Debe Proveedores / Haber Inventario + ITBIS
 * Crédito Fiscal). Sumada a la compra original, una NCC total deja saldo
 * cero en las 3 cuentas; una NCC parcial deja el residual proporcional.
 */

import { AsientosAutomaticosService } from './asientos-automaticos.service';

jest.mock('../../common/observability/sentry', () => ({
  reportServiceError: jest.fn(),
}));

const cuenta = (codigo: string, id: number) =>
  ({ id, codigo, isActive: true, permiteMovimientos: true }) as any;

function makeService(opts: { empresaId?: number; cuentas?: any[] } = {}) {
  const cuentaRepository = { find: jest.fn().mockResolvedValue(opts.cuentas ?? []) };
  const lineasGuardadas: any[] = [];
  const asientoRepository = {
    create: jest.fn((data: any) => data),
    save:   jest.fn(async (data: any) => ({ id: Math.floor(Math.random() * 100000), ...data })),
  };
  const lineaRepository = {
    create: jest.fn((data: any) => data),
    save:   jest.fn(async (data: any) => {
      lineasGuardadas.push(...(Array.isArray(data) ? data : [data]));
      return data;
    }),
  };
  const tenantService = {
    getEmpresaId: () => {
      if (opts.empresaId === undefined) throw new Error('sin contexto de empresa');
      return opts.empresaId;
    },
  };
  const dataSource = { query: jest.fn().mockResolvedValue([{ numero: 1 }]) };

  const svc: any = Object.create(AsientosAutomaticosService.prototype);
  svc.logger            = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
  svc.cuentaRepository  = cuentaRepository;
  svc.asientoRepository = asientoRepository;
  svc.lineaRepository   = lineaRepository;
  svc.tenantService     = tenantService;
  svc.dataSource        = dataSource;
  return { svc, lineasGuardadas };
}

function sumarPorCuenta(lineas: any[]) {
  const acc: Record<number, { debe: number; haber: number }> = {};
  for (const l of lineas) {
    acc[l.cuentaContableId] ??= { debe: 0, haber: 0 };
    acc[l.cuentaContableId].debe  += Number(l.debe);
    acc[l.cuentaContableId].haber += Number(l.haber);
  }
  return acc;
}

const INVENTARIO = 1, ITBIS_CREDITO = 2, PROVEEDORES = 3;
const CUENTAS = [
  cuenta('1.1.3.01', INVENTARIO), cuenta('1.1.4.01', ITBIS_CREDITO), cuenta('2.1.1.01', PROVEEDORES),
];

describe('Simetría Compra + Nota de Crédito de Compra', () => {
  it('NCC total: la suma de ambos asientos deja saldo cero en Inventario, ITBIS Crédito y Proveedores', async () => {
    const { svc, lineasGuardadas } = makeService({ empresaId: 7, cuentas: CUENTAS });

    await svc.asientoCompraRecibida(20, 1180, 1000, 180, 'COMP-20', 5);
    await svc.asientoNotaCreditoCompra(1, 1180, 1000, 180, 'NCC-1', 5); // NCC = 100% de la compra

    const saldos = sumarPorCuenta(lineasGuardadas);
    for (const id of [INVENTARIO, ITBIS_CREDITO, PROVEEDORES]) {
      expect(saldos[id].debe - saldos[id].haber).toBeCloseTo(0, 2);
    }
  });

  it('NCC parcial (30%): el ajuste es proporcional — deja el residual correcto, no cero', async () => {
    const { svc, lineasGuardadas } = makeService({ empresaId: 7, cuentas: CUENTAS });

    await svc.asientoCompraRecibida(20, 1180, 1000, 180, 'COMP-20', 5);
    await svc.asientoNotaCreditoCompra(1, 354, 300, 54, 'NCC-1', 5); // NCC = 30% de la compra

    const saldos = sumarPorCuenta(lineasGuardadas);
    // Inventario: compra debe 1000, NCC haber 300 → queda debe neto 700 (70% restante).
    expect(saldos[INVENTARIO].debe - saldos[INVENTARIO].haber).toBeCloseTo(700, 2);
    // ITBIS Crédito: compra debe 180, NCC haber 54 → queda debe neto 126.
    expect(saldos[ITBIS_CREDITO].debe - saldos[ITBIS_CREDITO].haber).toBeCloseTo(126, 2);
    // Proveedores: compra haber 1180, NCC debe 354 → queda haber neto 826.
    expect(saldos[PROVEEDORES].haber - saldos[PROVEEDORES].debe).toBeCloseTo(826, 2);
  });
});
