/**
 * Regresion P1 — visibilidad de fallos de asiento contable.
 *
 * Los 18 metodos publicos de AsientosAutomaticosService son fire-and-forget por
 * convencion (una venta/compra/cobro no puede caerse por un problema contable).
 * Antes de este fix, sus catch solo hacian logger.error() (consola, invisible
 * fuera del servidor) y ningun caller comprobaba si _crearAsientoContabilizado
 * habia devuelto null por falta de una cuenta — logueaban "generado" igual.
 *
 * COBERTURA:
 * 1. Cuenta faltante → no lanza, reporta a Sentry con el codigo que falto,
 *    y el caller NO dice "generado".
 * 2. Error inesperado (no cuenta faltante) → se reporta con la operacion
 *    especifica del metodo que fallo, y el flujo no se rompe (no rechaza).
 * 3. Camino feliz → genera el asiento, loguea "generado", y NO reporta nada.
 * 4. El reporte de cuenta faltante se emite una sola vez (dentro de
 *    _crearAsientoContabilizado), sin importar cuantos callers lo invoquen.
 */

import { AsientosAutomaticosService } from './asientos-automaticos.service';
import { TipoOrigenAsiento } from '../entities/asiento-contable.entity';
import { reportServiceError } from '../../common/observability/sentry';

jest.mock('../../common/observability/sentry', () => ({
  reportServiceError: jest.fn(),
}));

const cuenta = (codigo: string, id: number) =>
  ({ id, codigo, isActive: true, permiteMovimientos: true }) as any;

function makeService(opts: {
  empresaId?: number;
  cuentas?: any[];
} = {}) {
  const cuentaRepository = { find: jest.fn().mockResolvedValue(opts.cuentas ?? []) };
  const asientoRepository = {
    create: jest.fn((data: any) => data),
    save:   jest.fn(async (data: any) => ({ id: 1, ...data })),
  };
  const lineaRepository = {
    create: jest.fn((data: any) => data),
    save:   jest.fn(async (data: any) => data),
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
  return svc as AsientosAutomaticosService & {
    logger: { log: jest.Mock; warn: jest.Mock; error: jest.Mock };
    cuentaRepository: { find: jest.Mock };
    asientoRepository: { create: jest.Mock; save: jest.Mock };
    lineaRepository: { create: jest.Mock; save: jest.Mock };
  };
}

beforeEach(() => jest.clearAllMocks());

describe('AsientosAutomaticosService — visibilidad de fallos', () => {
  // ── 1. Cuenta faltante ──────────────────────────────────────────────────

  it('cuenta faltante: no lanza, reporta a Sentry con el codigo que falto', async () => {
    const svc = makeService({ empresaId: 7, cuentas: [] }); // ninguna cuenta existe

    await expect(svc.asientoFacturaEmitida(123, 1180, 1000, 180, 'FAC-1', 5)).resolves.toBeUndefined();

    expect(svc.asientoRepository.save).not.toHaveBeenCalled();
    expect(reportServiceError).toHaveBeenCalledWith(
      expect.any(Error),
      'asiento_cuenta_no_encontrada',
      expect.objectContaining({
        empresaId:       '7',
        tipoOrigen:      TipoOrigenAsiento.FACTURA,
        referenciaId:    '123',
        referenciaFolio: 'FAC-1',
        codigoCuenta:    expect.any(String),
      }),
    );
  });

  it('cuenta faltante: el caller NO dice "generado" — loguea el warn correspondiente', async () => {
    const svc = makeService({ empresaId: 7, cuentas: [] });
    await svc.asientoFacturaEmitida(123, 1180, 1000, 180, 'FAC-1', 5);

    expect(svc.logger.log).not.toHaveBeenCalledWith(expect.stringContaining('generado'));
    expect(svc.logger.warn).toHaveBeenCalledWith(expect.stringContaining('NO generado'));
  });

  it('el reporte de cuenta faltante se emite una sola vez, sin importar el caller', async () => {
    const svc = makeService({ empresaId: 7, cuentas: [] });
    await svc.asientoCobro(500, 900, 99, 5);

    const reportesDeCuentaFaltante = (reportServiceError as jest.Mock).mock.calls
      .filter(([, operation]) => operation === 'asiento_cuenta_no_encontrada');
    expect(reportesDeCuentaFaltante).toHaveLength(1);
  });

  // ── 2. Error inesperado (no cuenta faltante) ────────────────────────────

  it('un error inesperado se reporta con la operacion especifica del metodo y no rompe el flujo', async () => {
    const svc = makeService({ empresaId: 7 });
    svc.cuentaRepository.find.mockRejectedValueOnce(new Error('conexion a BD perdida'));

    await expect(svc.asientoCobro(500, 900, 99, 5)).resolves.toBeUndefined(); // no rechaza

    expect(reportServiceError).toHaveBeenCalledWith(
      expect.any(Error),
      'asiento_cobro',
      expect.objectContaining({
        empresaId:       '7',
        tipoOrigen:      TipoOrigenAsiento.COBRO,
        referenciaId:    '900',
        referenciaFolio: 'PAGO-900',
      }),
    );
  });

  it('asientoGasto reporta con su propia operacion', async () => {
    const svc = makeService({ empresaId: 7 });
    svc.cuentaRepository.find.mockRejectedValueOnce(new Error('timeout'));

    await svc.asientoGasto(10, 118, 100, 18, 'Gasto de prueba', 5);

    expect(reportServiceError).toHaveBeenCalledWith(
      expect.any(Error), 'asiento_gasto', expect.objectContaining({ referenciaId: '10' }),
    );
  });

  // ── 3. Camino feliz ──────────────────────────────────────────────────────

  it('con las cuentas presentes: genera el asiento, loguea "generado", no reporta nada', async () => {
    const svc = makeService({
      empresaId: 7,
      cuentas: [cuenta('1.1.1.03', 1), cuenta('1.1.2.01', 2)], // BANCOS, CLIENTES
    });

    await svc.asientoCobro(500, 900, 99, 5);

    expect(svc.asientoRepository.save).toHaveBeenCalled();
    expect(svc.logger.log).toHaveBeenCalledWith(expect.stringContaining('generado'));
    expect(reportServiceError).not.toHaveBeenCalled();
  });

  it('asientoAnticipo devuelve el id del asiento y no reporta nada en el camino feliz', async () => {
    const svc = makeService({
      empresaId: 7,
      cuentas: [cuenta('1.1.1.02', 1), cuenta('2.1.5.01', 2)], // CAJA, ANTICIPOS_CLIENTES
    });

    const id = await svc.asientoAnticipo(200, 50, 'efectivo', 5);

    expect(id).toBe(1);
    expect(reportServiceError).not.toHaveBeenCalled();
  });

  it('asientoAnticipo devuelve null (no revienta) cuando falta una cuenta', async () => {
    const svc = makeService({ empresaId: 7, cuentas: [] });
    const id = await svc.asientoAnticipo(200, 50, 'efectivo', 5);

    expect(id).toBeNull();
    expect(reportServiceError).toHaveBeenCalledWith(
      expect.any(Error), 'asiento_cuenta_no_encontrada', expect.any(Object),
    );
  });

  // ── asientoDepreciacion — por categoría (2026-09-19) ────────────────────
  // Antes recibía un solo montoTotal contra 2 cuentas fijas; ahora recibe un
  // desglose por (cuentaGasto, cuentaDepreciacion) — CategoriaActivo ya
  // tenía sus propias cuentas por categoría, pero nadie las leía.

  // lineaRepository.create() se llama UNA vez con el arreglo completo de
  // líneas (ver _crearAsientoContabilizado), no una vez por línea — de ahí
  // `.mock.calls[0][0]` en vez de `.mock.calls.map(...)`.

  it('un solo par de cuentas: arma una línea débito/haber, igual que antes', async () => {
    const svc = makeService({
      empresaId: 7,
      cuentas: [cuenta('6.2.1.01', 1), cuenta('1.2.2.01', 2)],
    });

    await svc.asientoDepreciacion(
      [{ cuentaGasto: '6.2.1.01', cuentaDepreciacion: '1.2.2.01', monto: 500 }],
      '2026-09', '2026-09-30', 5,
    );

    expect(svc.asientoRepository.save).toHaveBeenCalled();
    const lineas = svc.lineaRepository.create.mock.calls[0][0];
    expect(lineas).toHaveLength(2);
    expect(lineas.find((l: any) => l.debe === 500)?.cuentaContableId).toBe(1);
    expect(lineas.find((l: any) => l.haber === 500)?.cuentaContableId).toBe(2);
  });

  it('dos categorías con cuentas DISTINTAS: arma dos líneas débito/haber, una por cada par', async () => {
    const svc = makeService({
      empresaId: 7,
      cuentas: [
        cuenta('6.2.1.01', 1), cuenta('1.2.2.01', 2), // categoría A
        cuenta('6.2.1.02', 3), cuenta('1.2.2.02', 4), // categoría B (custom)
      ],
    });

    await svc.asientoDepreciacion(
      [
        { cuentaGasto: '6.2.1.01', cuentaDepreciacion: '1.2.2.01', monto: 500 },
        { cuentaGasto: '6.2.1.02', cuentaDepreciacion: '1.2.2.02', monto: 300 },
      ],
      '2026-09', '2026-09-30', 5,
    );

    const lineas = svc.lineaRepository.create.mock.calls[0][0];
    expect(lineas).toHaveLength(4);
    expect(lineas.filter((l: any) => l.debe > 0)).toHaveLength(2);
    expect(lineas.filter((l: any) => l.haber > 0)).toHaveLength(2);
  });

  it('dos categorías con el MISMO par de cuentas: se fusionan en una sola línea, no se repite la cuenta', async () => {
    const svc = makeService({
      empresaId: 7,
      cuentas: [cuenta('6.2.1.01', 1), cuenta('1.2.2.01', 2)],
    });

    await svc.asientoDepreciacion(
      [
        { cuentaGasto: '6.2.1.01', cuentaDepreciacion: '1.2.2.01', monto: 500 },
        { cuentaGasto: '6.2.1.01', cuentaDepreciacion: '1.2.2.01', monto: 300 },
      ],
      '2026-09', '2026-09-30', 5,
    );

    const lineas = svc.lineaRepository.create.mock.calls[0][0];
    expect(lineas).toHaveLength(2); // no 4 — se fusionaron
    expect(lineas.find((l: any) => l.debe > 0)?.debe).toBe(800);
    expect(lineas.find((l: any) => l.haber > 0)?.haber).toBe(800);
  });

  it('desglose vacío: no genera ningún asiento ni reporta nada', async () => {
    const svc = makeService({ empresaId: 7, cuentas: [] });
    await svc.asientoDepreciacion([], '2026-09', '2026-09-30', 5);

    expect(svc.asientoRepository.save).not.toHaveBeenCalled();
    expect(reportServiceError).not.toHaveBeenCalled();
  });
});
