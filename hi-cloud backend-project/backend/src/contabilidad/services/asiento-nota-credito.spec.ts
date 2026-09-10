/**
 * Simetría Factura + Nota de Crédito.
 *
 * asientoNotaCredito() usa el mismo criterio de cuentas que
 * asientoDevolucionVenta (Debe Ventas + Debe ITBIS por Pagar / Haber
 * Clientes). Estos tests verifican la propiedad que importa: sumada a la
 * factura original, una NC TOTAL deja saldo cero en las 3 cuentas, y una NC
 * PARCIAL deja el residual proporcional correcto.
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

/** Suma debe/haber por cuenta a través de TODAS las líneas guardadas (varios asientos). */
function sumarPorCuenta(lineas: any[]) {
  const acc: Record<number, { debe: number; haber: number }> = {};
  for (const l of lineas) {
    acc[l.cuentaContableId] ??= { debe: 0, haber: 0 };
    acc[l.cuentaContableId].debe  += Number(l.debe);
    acc[l.cuentaContableId].haber += Number(l.haber);
  }
  return acc;
}

const CLIENTES = 1, VENTAS = 2, ITBIS = 3;
const CUENTAS = [cuenta('1.1.2.01', CLIENTES), cuenta('4.1.1.01', VENTAS), cuenta('2.1.2.01', ITBIS)];

describe('Simetría Factura + Nota de Crédito', () => {
  it('NC total: la suma de ambos asientos deja saldo cero en Ventas, ITBIS por Pagar y Clientes', async () => {
    const { svc, lineasGuardadas } = makeService({ empresaId: 7, cuentas: CUENTAS });

    await svc.asientoFacturaEmitida(10, 1180, 1000, 180, 'FAC-1', 5);
    await svc.asientoNotaCredito(1, 1180, 1000, 180, 'NC-1', 5); // NC = 100% de la factura

    const saldos = sumarPorCuenta(lineasGuardadas);
    for (const id of [CLIENTES, VENTAS, ITBIS]) {
      expect(saldos[id].debe - saldos[id].haber).toBeCloseTo(0, 2);
    }
  });

  it('NC parcial (30%): el ajuste es proporcional — deja el residual correcto, no cero', async () => {
    const { svc, lineasGuardadas } = makeService({ empresaId: 7, cuentas: CUENTAS });

    await svc.asientoFacturaEmitida(10, 1180, 1000, 180, 'FAC-1', 5);
    await svc.asientoNotaCredito(1, 354, 300, 54, 'NC-1', 5); // NC = 30% de la factura

    const saldos = sumarPorCuenta(lineasGuardadas);
    // Clientes: factura debe 1180, NC haber 354 → queda debe neto 826 (el 70% restante).
    expect(saldos[CLIENTES].debe - saldos[CLIENTES].haber).toBeCloseTo(826, 2);
    // Ventas: factura haber 1000, NC debe 300 → queda haber neto 700.
    expect(saldos[VENTAS].haber - saldos[VENTAS].debe).toBeCloseTo(700, 2);
    // ITBIS: factura haber 180, NC debe 54 → queda haber neto 126.
    expect(saldos[ITBIS].haber - saldos[ITBIS].debe).toBeCloseTo(126, 2);
  });

  it('dos NC parciales que suman el 100% dejan el mismo resultado que una NC total', async () => {
    const { svc, lineasGuardadas } = makeService({ empresaId: 7, cuentas: CUENTAS });

    await svc.asientoFacturaEmitida(10, 1180, 1000, 180, 'FAC-1', 5);
    await svc.asientoNotaCredito(1, 708,  600, 108, 'NC-1', 5);  // 60%
    await svc.asientoNotaCredito(2, 472,  400, 72,  'NC-2', 5);  // 40%

    const saldos = sumarPorCuenta(lineasGuardadas);
    for (const id of [CLIENTES, VENTAS, ITBIS]) {
      expect(saldos[id].debe - saldos[id].haber).toBeCloseTo(0, 2);
    }
  });
});
