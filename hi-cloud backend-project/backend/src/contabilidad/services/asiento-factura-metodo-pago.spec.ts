/**
 * FIX 3, FASE A commit 2 (2026-09-20) — antes, TODA factura (de contado o a
 * crédito) debitaba Clientes por el neto completo: una venta de contado
 * nunca generaba automáticamente el cobro que la compensara, así que
 * Clientes se inflaba para siempre con cada venta de contado (RD$7.77M en
 * una sola empresa, ver diagnóstico previo). Ahora asientoFacturaEmitida()
 * elige la cuenta de débito según el medio de pago real de la factura.
 *
 * COBERTURA:
 * 1. Contado en efectivo → una sola línea, debita Caja por el neto completo.
 * 2. Contado mixto (efectivo + tarjeta) → una línea por método, cada una
 *    por su propio monto — nunca toca Clientes.
 * 3. Crédito puro (con o sin formasPago) → Clientes por el neto completo,
 *    comportamiento IDÉNTICO al de antes de este commit.
 * 4. Crédito con abono inicial → Clientes por el SALDO (neto − abono),
 *    medio de pago por el abono — nunca por lo que traiga la entrada
 *    tipo=4 en sí misma.
 * 5. Medio de pago resuelto a una cuenta que NO existe en el catálogo → NO
 *    descarta el asiento completo en silencio: reporta a Sentry y cae a
 *    Caja para esa línea puntual.
 */

import { AsientosAutomaticosService, COD } from './asientos-automaticos.service';
import { reportServiceError } from '../../common/observability/sentry';

jest.mock('../../common/observability/sentry', () => ({
  reportServiceError: jest.fn(),
}));

const cuenta = (codigo: string, id: number) =>
  ({ id, codigo, isActive: true, permiteMovimientos: true }) as any;

function makeService(cuentasCatalogo: any[]) {
  const cuentaRepository = {
    find:    jest.fn().mockResolvedValue(cuentasCatalogo),
    findOne: jest.fn(({ where }: any) =>
      Promise.resolve(cuentasCatalogo.find(c => c.codigo === where.codigo) ?? null)),
  };
  const asientoRepository = { create: jest.fn((d: any) => d), save: jest.fn(async (d: any) => ({ id: 1, ...d })) };
  const lineaRepository   = { create: jest.fn((d: any) => d), save: jest.fn(async (d: any) => d) };
  const tenantService     = { getEmpresaId: () => 7 };
  const dataSource        = { query: jest.fn().mockResolvedValue([{ numero: 1 }]) };

  const svc: any = Object.create(AsientosAutomaticosService.prototype);
  svc.logger            = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
  svc.cuentaRepository  = cuentaRepository;
  svc.asientoRepository = asientoRepository;
  svc.lineaRepository   = lineaRepository;
  svc.tenantService     = tenantService;
  svc.dataSource        = dataSource;
  // Sin configuracionService — usa los defaults COD.* (resolverCuentaConcepto
  // cae al fallback cuando la llamada a configuracionService.resolverCuenta
  // lanza, igual que "sin ConfiguracionContableService disponible" en
  // asientos-automaticos.service.spec.ts).
  return { svc: svc as AsientosAutomaticosService, lineaRepository };
}

beforeEach(() => jest.clearAllMocks());

// COD.CLIENTES='1.1.2.01' id 1 · COD.CAJA='1.1.1.02' id 2 · COD.VENTAS id 3 ·
// COD.ITBIS_POR_PAGAR id 4 · COD.BANCOS='1.1.1.03' id 5 (fallback de tarjeta
// sin configuración específica).
const CATALOGO_COMPLETO = [
  cuenta(COD.CLIENTES, 1), cuenta(COD.CAJA, 2), cuenta(COD.VENTAS, 3),
  cuenta(COD.ITBIS_POR_PAGAR, 4), cuenta(COD.BANCOS, 5),
];

describe('asientoFacturaEmitida — medio de pago (FIX 3, FASE A commit 2)', () => {
  it('contado en efectivo: una sola línea, debita Caja por el neto completo', async () => {
    const { svc, lineaRepository } = makeService(CATALOGO_COMPLETO);

    await (svc as any).asientoFacturaEmitida(
      1, 1180, 1000, 180, 'FAC-1', '2026-09-19', 5, undefined,
      { tipoPago: 'CONTADO', formasPago: [{ tipo: 1, monto: 1180 }] },
    );

    const lineas = lineaRepository.create.mock.calls[0][0];
    expect(lineas.find((l: any) => l.cuentaContableId === 2)?.debe).toBe(1180); // Caja
    expect(lineas.find((l: any) => l.cuentaContableId === 1)).toBeUndefined();  // nunca Clientes
  });

  it('contado mixto (efectivo + tarjeta): una línea por método, cada una por su monto', async () => {
    const { svc, lineaRepository } = makeService(CATALOGO_COMPLETO);

    await (svc as any).asientoFacturaEmitida(
      2, 1000, 847.46, 152.54, 'FAC-2', '2026-09-19', 5, undefined,
      { tipoPago: 'CONTADO', formasPago: [{ tipo: 1, monto: 400 }, { tipo: 3, monto: 600 }] },
    );

    const lineas = lineaRepository.create.mock.calls[0][0];
    expect(lineas.find((l: any) => l.cuentaContableId === 2)?.debe).toBe(400); // efectivo → Caja
    expect(lineas.find((l: any) => l.cuentaContableId === 5)?.debe).toBe(600); // tarjeta → Bancos (default)
    expect(lineas.find((l: any) => l.cuentaContableId === 1)).toBeUndefined(); // nunca Clientes
    const totalDebe = lineas.reduce((s: number, l: any) => s + l.debe, 0);
    expect(totalDebe).toBe(1000);
  });

  it('crédito puro (con formasPago tipo=4): Clientes por el neto completo — sin cambio de comportamiento', async () => {
    const { svc, lineaRepository } = makeService(CATALOGO_COMPLETO);

    await (svc as any).asientoFacturaEmitida(
      3, 1180, 1000, 180, 'FAC-3', '2026-09-19', 5, undefined,
      { tipoPago: 'CREDITO', formasPago: [{ tipo: 4, monto: 1180 }] },
    );

    const lineas = lineaRepository.create.mock.calls[0][0];
    expect(lineas.find((l: any) => l.cuentaContableId === 1)?.debe).toBe(1180); // Clientes
    expect(lineas.find((l: any) => l.cuentaContableId === 2)).toBeUndefined();  // nunca Caja
  });

  it('crédito legacy sin formasPago: Clientes por el neto completo — idéntico al comportamiento de antes de este commit', async () => {
    const { svc, lineaRepository } = makeService(CATALOGO_COMPLETO);

    await (svc as any).asientoFacturaEmitida(4, 1180, 1000, 180, 'FAC-4', '2026-09-19', 5);

    const lineas = lineaRepository.create.mock.calls[0][0];
    expect(lineas.find((l: any) => l.cuentaContableId === 1)?.debe).toBe(1180);
  });

  it('crédito con abono inicial: Clientes por el saldo (neto − abono), medio de pago por el abono', async () => {
    const { svc, lineaRepository } = makeService(CATALOGO_COMPLETO);

    await (svc as any).asientoFacturaEmitida(
      5, 2000, 1694.92, 305.08, 'FAC-5', '2026-09-19', 5, undefined,
      { tipoPago: 'CREDITO', formasPago: [{ tipo: 1, monto: 500 }, { tipo: 4, monto: 1500 }] },
    );

    const lineas = lineaRepository.create.mock.calls[0][0];
    expect(lineas.find((l: any) => l.cuentaContableId === 1)?.debe).toBe(1500); // Clientes: 2000-500
    expect(lineas.find((l: any) => l.cuentaContableId === 2)?.debe).toBe(500);  // Caja: el abono
  });

  it('contado legacy sin formasPago: todo a Caja, nunca a Clientes', async () => {
    const { svc, lineaRepository } = makeService(CATALOGO_COMPLETO);

    await (svc as any).asientoFacturaEmitida(
      6, 1180, 1000, 180, 'FAC-6', '2026-09-19', 5, undefined, { tipoPago: 'CONTADO' },
    );

    const lineas = lineaRepository.create.mock.calls[0][0];
    expect(lineas.find((l: any) => l.cuentaContableId === 2)?.debe).toBe(1180);
    expect(lineas.find((l: any) => l.cuentaContableId === 1)).toBeUndefined();
  });

  it('medio de pago resuelto a una cuenta ausente del catálogo: NO descarta el asiento, reporta a Sentry y cae a Caja', async () => {
    // Catálogo SIN Bancos — la tarjeta resolvería ahí por default.
    const catalogoSinBancos = [cuenta(COD.CLIENTES, 1), cuenta(COD.CAJA, 2), cuenta(COD.VENTAS, 3), cuenta(COD.ITBIS_POR_PAGAR, 4)];
    const { svc, lineaRepository } = makeService(catalogoSinBancos);

    await (svc as any).asientoFacturaEmitida(
      7, 1180, 1000, 180, 'FAC-7', '2026-09-19', 5, undefined,
      { tipoPago: 'CONTADO', formasPago: [{ tipo: 3, monto: 1180 }] }, // tarjeta
    );

    const lineas = lineaRepository.create.mock.calls[0][0];
    expect(lineas.find((l: any) => l.cuentaContableId === 2)?.debe).toBe(1180); // cayó a Caja
    expect(reportServiceError).toHaveBeenCalledWith(
      expect.any(Error),
      'asiento_metodo_pago_cuenta_faltante',
      expect.objectContaining({ referenciaFolio: 'FAC-7', metodoPago: 'tarjeta' }),
    );
  });
});
