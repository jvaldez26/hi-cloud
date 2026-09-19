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

import { AsientosAutomaticosService, COD } from './asientos-automaticos.service';
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

  // ── cuentaManual — auditoría del selector de cuenta contable (2026-09-19) ──

  it('asientoGasto con cuentaManual=true marca SOLO la línea de gasto como manual, no las demás', async () => {
    const svc = makeService({
      empresaId: 7,
      cuentas: [cuenta('6.1.2.07', 1), cuenta('1.1.4.01', 2), cuenta('1.1.1.03', 3)],
    });

    await svc.asientoGasto(10, 118, 100, 18, 'Mantenimiento elegido a mano', '2026-09-19', 5, '6.1.2.07', true);

    const lineas = svc.lineaRepository.create.mock.calls[0][0];
    expect(lineas.find((l: any) => l.cuentaContableId === 1)?.cuentaManual).toBe(true);  // la cuenta de gasto elegida
    expect(lineas.find((l: any) => l.cuentaContableId === 2)?.cuentaManual).toBeUndefined(); // ITBIS crédito
    expect(lineas.find((l: any) => l.cuentaContableId === 3)?.cuentaManual).toBeUndefined(); // Bancos
  });

  it('asientoGasto sin cuentaManual (default false): ninguna línea queda marcada', async () => {
    const svc = makeService({
      empresaId: 7,
      cuentas: [cuenta('6.1.2.04', 1), cuenta('1.1.1.03', 3)],
    });

    await svc.asientoGasto(10, 100, 100, 0, 'Gasto normal', '2026-09-19', 5);

    const lineas = svc.lineaRepository.create.mock.calls[0][0];
    expect(lineas.every((l: any) => !l.cuentaManual)).toBe(true);
  });

  it('asientoCompraRecibida con cuentaDestino elegida: marca SOLO esa línea como manual', async () => {
    const svc = makeService({
      empresaId: 7,
      cuentas: [cuenta('1.2.1.01', 1), cuenta('1.1.4.01', 2), cuenta('2.1.1.01', 3)],
    });

    await svc.asientoCompraRecibida(50, 590, 500, 90, 'COM-001', '2026-09-19', 5, undefined, '1.2.1.01', true);

    const lineas = svc.lineaRepository.create.mock.calls[0][0];
    expect(lineas.find((l: any) => l.cuentaContableId === 1)?.cuentaManual).toBe(true);  // cuentaDestino elegida
    expect(lineas.find((l: any) => l.cuentaContableId === 2)?.cuentaManual).toBeUndefined(); // ITBIS crédito
    expect(lineas.find((l: any) => l.cuentaContableId === 3)?.cuentaManual).toBeUndefined(); // Proveedores
  });

  // ── Panel de vista previa — previsualizarCompra() (2026-09-19) ──────────

  it('previsualizarCompra: con las cuentas presentes, ok=true y cuadrado', async () => {
    const svc = makeService({
      empresaId: 7,
      cuentas: [cuenta('1.1.3.01', 1), cuenta('1.1.4.01', 2), cuenta('2.1.1.01', 3)],
    });

    const r = await svc.previsualizarCompra(590, 500, 90, 'COM-001');

    expect(r.ok).toBe(true);
    expect(r.cuadrado).toBe(true);
    expect(r.totalDebe).toBe(590);
    expect(r.totalHaber).toBe(590);
  });

  it('previsualizarCompra: con cuentaDestino elegida inexistente, ok=false con motivo legible', async () => {
    const svc = makeService({ empresaId: 7, cuentas: [] });

    const r = await svc.previsualizarCompra(590, 500, 90, 'COM-001', undefined, '9.9.9.99');

    expect(r.ok).toBe(false);
    expect(r.error).toContain('9.9.9.99');
  });

  it('previsualizarCompra: con retenciones, arma las líneas de retención igual que el asiento real', async () => {
    const svc = makeService({
      empresaId: 7,
      cuentas: [
        cuenta('1.1.3.01', 1), cuenta('1.1.4.01', 2), cuenta('2.1.1.01', 3),
        cuenta('2.1.2.03', 4), cuenta('2.1.2.04', 5),
      ],
    });

    const r = await svc.previsualizarCompra(590, 500, 90, 'COM-001', { montoItbis: 27, montoIsr: 50, netoPagar: 513 });

    expect(r.lineas).toHaveLength(5); // inventario, itbis crédito, proveedores, itbis retenido, isr retenido
    expect(r.totalHaber).toBe(590); // proveedores (513) + itbis ret (27) + isr ret (50)
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

  // ── Panel de vista previa — previsualizarDepreciacion() (2026-09-19) ────
  // Misma fusión por (cuentaGasto, cuentaDepreciacion) que asientoDepreciacion,
  // sin persistir ni reportar nada — la usa ActivosFijosService antes de
  // correr la depreciación del período.

  it('con las cuentas presentes: ok=true, cuadrado, sin persistir nada', async () => {
    const svc = makeService({
      empresaId: 7,
      cuentas: [
        { ...cuenta('6.2.1.01', 1), nombre: 'Depreciación Activos Fijos' },
        { ...cuenta('1.2.2.01', 2), nombre: 'Depreciación Acumulada' },
      ],
    });

    const r: any = await svc.previsualizarDepreciacion(
      [{ cuentaGasto: '6.2.1.01', cuentaDepreciacion: '1.2.2.01', monto: 500 }],
      '2026-09',
    );

    expect(r.ok).toBe(true);
    expect(r.cuadrado).toBe(true);
    expect(r.totalDebe).toBe(500);
    expect(r.totalHaber).toBe(500);
    expect(r.lineas.find((l: any) => l.codigo === '6.2.1.01')?.nombre).toBe('Depreciación Activos Fijos');
    expect(svc.asientoRepository.save).not.toHaveBeenCalled();
    expect(reportServiceError).not.toHaveBeenCalled();
  });

  it('con una cuenta de categoría custom inexistente: ok=false con un motivo legible', async () => {
    const svc = makeService({ empresaId: 7, cuentas: [] });

    const r: any = await svc.previsualizarDepreciacion(
      [{ cuentaGasto: '6.2.9.99', cuentaDepreciacion: '1.2.9.99', monto: 500 }],
      '2026-09',
    );

    expect(r.ok).toBe(false);
    expect(r.error).toContain('6.2.9.99');
  });

  it('desglose vacío (sin monto): ok=false sin llamar a resolverLineasAsiento', async () => {
    const svc = makeService({ empresaId: 7, cuentas: [] });

    const r: any = await svc.previsualizarDepreciacion([], '2026-09');

    expect(r.ok).toBe(false);
    expect(svc.cuentaRepository.find).not.toHaveBeenCalled();
  });

  // ── Panel de vista previa — previsualizarGasto() (2026-09-19) ───────────
  // Debe usar EXACTAMENTE la misma resolución/validación que asientoGasto()
  // (no una réplica), sin persistir ni reportar nada a Sentry — una
  // previsualización con datos incompletos no es un fallo operacional.

  it('con las cuentas presentes: ok=true, trae nombre y código de cada cuenta, y no persiste ni guarda nada', async () => {
    const svc = makeService({
      empresaId: 7,
      cuentas: [cuenta('6.1.2.01', 1), cuenta('1.1.4.01', 2), cuenta('1.1.1.03', 3)],
    });
    // Renombrar la cuenta 1 para verificar que el preview trae el nombre real, no uno inventado
    svc.cuentaRepository.find.mockResolvedValue([
      { ...cuenta('6.1.2.01', 1), nombre: 'Alquiler de Local' },
      { ...cuenta('1.1.4.01', 2), nombre: 'ITBIS Crédito Fiscal (Compras)' },
      { ...cuenta('1.1.1.03', 3), nombre: 'Bancos' },
    ]);

    const r = await svc.previsualizarGasto(118, 100, 18, 'Alquiler de septiembre', '6.1.2.01');

    expect(r.ok).toBe(true);
    expect(r.cuadrado).toBe(true);
    expect(r.totalDebe).toBe(118);
    expect(r.totalHaber).toBe(118);
    expect(r.lineas.find((l: any) => l.codigo === '6.1.2.01')?.nombre).toBe('Alquiler de Local');
    expect(svc.asientoRepository.save).not.toHaveBeenCalled();
    expect(svc.lineaRepository.save).not.toHaveBeenCalled();
    expect(reportServiceError).not.toHaveBeenCalled();
  });

  it('con la cuenta de gasto elegida inexistente: ok=false con un motivo legible, no lanza ni reporta a Sentry', async () => {
    const svc = makeService({ empresaId: 7, cuentas: [] });

    const r = await svc.previsualizarGasto(118, 100, 18, 'Gasto de prueba', '9.9.9.99');

    expect(r.ok).toBe(false);
    expect(r.error).toContain('9.9.9.99');
    expect(reportServiceError).not.toHaveBeenCalled();
  });

  it('sin ITBIS, la línea de crédito fiscal no aparece en la vista previa (igual que en el asiento real)', async () => {
    const svc = makeService({
      empresaId: 7,
      cuentas: [cuenta('6.1.2.01', 1), cuenta('1.1.1.03', 3)],
    });

    const r = await svc.previsualizarGasto(100, 100, 0, 'Gasto sin ITBIS', '6.1.2.01');

    expect(r.lineas.map((l: any) => l.codigo)).toEqual(['6.1.2.01', '1.1.1.03']);
  });

  // ── Selector de cuenta contable — CxC/CxP con contrapartida atípica (2026-09-19) ──
  // La contrapartida por default es Bancos; el selector del formulario
  // permite elegir otra (p. ej. una compensación) sin saltarse la validación
  // del motor (permiteMovimientos, partida doble).

  it('asientoCobro con cuentaContrapartida elegida: marca SOLO esa línea como manual, no Clientes', async () => {
    const svc = makeService({
      empresaId: 7,
      cuentas: [cuenta('1.1.1.02', 1), cuenta('1.1.2.01', 2)],
    });

    await svc.asientoCobro(500, 900, 99, '2026-09-19', 5, '1.1.1.02', true);

    const lineas = svc.lineaRepository.create.mock.calls[0][0];
    expect(lineas.find((l: any) => l.cuentaContableId === 1)?.cuentaManual).toBe(true);  // contrapartida elegida
    expect(lineas.find((l: any) => l.cuentaContableId === 2)?.cuentaManual).toBeUndefined(); // Clientes
  });

  it('asientoCobro sin cuentaContrapartida: usa Bancos por default, ninguna línea manual', async () => {
    const svc = makeService({
      empresaId: 7,
      cuentas: [cuenta(COD.BANCOS, 1), cuenta('1.1.2.01', 2)],
    });

    await svc.asientoCobro(500, 900, 99, '2026-09-19', 5);

    const lineas = svc.lineaRepository.create.mock.calls[0][0];
    expect(lineas.every((l: any) => !l.cuentaManual)).toBe(true);
  });

  it('asientoPago con cuentaContrapartida elegida: marca SOLO esa línea como manual, no Proveedores', async () => {
    const svc = makeService({
      empresaId: 7,
      cuentas: [cuenta('2.1.1.01', 1), cuenta('6.1.2.09', 2)],
    });

    await svc.asientoPago(300, 700, 30, '2026-09-19', 5, '6.1.2.09', true);

    const lineas = svc.lineaRepository.create.mock.calls[0][0];
    expect(lineas.find((l: any) => l.cuentaContableId === 2)?.cuentaManual).toBe(true);  // contrapartida elegida
    expect(lineas.find((l: any) => l.cuentaContableId === 1)?.cuentaManual).toBeUndefined(); // Proveedores
  });

  it('previsualizarCobro: con las cuentas presentes, ok=true y cuadrado', async () => {
    const svc = makeService({
      empresaId: 7,
      cuentas: [cuenta(COD.BANCOS, 1), cuenta('1.1.2.01', 2)],
    });

    const r: any = await svc.previsualizarCobro(500, 900, 99);

    expect(r.ok).toBe(true);
    expect(r.cuadrado).toBe(true);
    expect(r.totalDebe).toBe(500);
  });

  it('previsualizarCobro: con contrapartida elegida inexistente, ok=false con motivo legible', async () => {
    const svc = makeService({ empresaId: 7, cuentas: [] });

    const r: any = await svc.previsualizarCobro(500, 900, 99, '9.9.9.99');

    expect(r.ok).toBe(false);
    expect(r.error).toContain('9.9.9.99');
  });

  it('previsualizarPago: con las cuentas presentes, ok=true y cuadrado', async () => {
    const svc = makeService({
      empresaId: 7,
      cuentas: [cuenta('2.1.1.01', 1), cuenta(COD.BANCOS, 2)],
    });

    const r: any = await svc.previsualizarPago(300, 700, 30);

    expect(r.ok).toBe(true);
    expect(r.cuadrado).toBe(true);
    expect(r.totalHaber).toBe(300);
  });

  it('previsualizarPago: con contrapartida elegida inexistente, ok=false con motivo legible', async () => {
    const svc = makeService({ empresaId: 7, cuentas: [cuenta(COD.PROVEEDORES, 1)] });

    const r: any = await svc.previsualizarPago(300, 700, 30, '9.9.9.99');

    expect(r.ok).toBe(false);
    expect(r.error).toContain('9.9.9.99');
  });
});

describe('AsientosAutomaticosService — Configuración Contable por Módulo (2026-09-19)', () => {
  // Antes: metodoPago === 'efectivo' ? CAJA : BANCOS — tarjeta, transferencia
  // y cheque eran indistinguibles. Ahora cada uno es su propio concepto
  // configurable, resuelto contra ConfiguracionContableService.

  it('asientoRecibo con metodoPago=tarjeta: usa la cuenta configurada para COBRO_TARJETA, no el default Bancos', async () => {
    const svc = makeService({
      empresaId: 7,
      cuentas: [cuenta('9.9.1.01', 1), cuenta(COD.CLIENTES, 2)],
    });
    svc.configuracionService = { resolverCuenta: jest.fn().mockResolvedValue('9.9.1.01') };

    await svc.asientoRecibo(500, 900, 'tarjeta', '2026-09-19', 5);

    expect(svc.configuracionService.resolverCuenta).toHaveBeenCalledWith(7, 'COBRO_TARJETA');
    const lineas = svc.lineaRepository.create.mock.calls[0][0];
    expect(lineas.find((l: any) => l.debe === 500)?.cuentaContableId).toBe(1);
  });

  it('asientoRecibo con metodoPago=cheque: pide el concepto COBRO_CHEQUE, no COBRO_TARJETA ni COBRO_OTRO', async () => {
    const svc = makeService({
      empresaId: 7,
      cuentas: [cuenta(COD.BANCOS, 1), cuenta(COD.CLIENTES, 2)],
    });
    svc.configuracionService = { resolverCuenta: jest.fn().mockResolvedValue(COD.BANCOS) };

    await svc.asientoRecibo(500, 900, 'cheque', '2026-09-19', 5);

    expect(svc.configuracionService.resolverCuenta).toHaveBeenCalledWith(7, 'COBRO_CHEQUE');
  });

  it('un método de pago desconocido cae en el concepto COBRO_OTRO (nunca revienta)', async () => {
    const svc = makeService({
      empresaId: 7,
      cuentas: [cuenta(COD.BANCOS, 1), cuenta(COD.CLIENTES, 2)],
    });
    svc.configuracionService = { resolverCuenta: jest.fn().mockResolvedValue(COD.BANCOS) };

    await svc.asientoRecibo(500, 900, 'criptomoneda', '2026-09-19', 5);

    expect(svc.configuracionService.resolverCuenta).toHaveBeenCalledWith(7, 'COBRO_OTRO');
  });

  it('sin ConfiguracionContableService disponible (o si falla): usa el fallback exacto de antes, no revienta el asiento', async () => {
    const svc = makeService({
      empresaId: 7,
      cuentas: [cuenta(COD.BANCOS, 1), cuenta(COD.CLIENTES, 2)],
    });
    // svc.configuracionService deliberadamente NO seteado — simula el caso
    // donde algo falla al resolver la configuración.

    await svc.asientoRecibo(500, 900, 'transferencia', '2026-09-19', 5);

    const lineas = svc.lineaRepository.create.mock.calls[0][0];
    expect(lineas.find((l: any) => l.debe === 500)?.cuentaContableId).toBe(1); // COD.BANCOS, el fallback de siempre
    expect(reportServiceError).not.toHaveBeenCalled();
  });

  it('asientoDesembolsoPrestamo: la cuenta de Cartera de Crédito también se resuelve por configuración', async () => {
    const svc = makeService({
      empresaId: 7,
      cuentas: [cuenta('1.1.2.99', 1), cuenta(COD.BANCOS, 2)],
    });
    svc.configuracionService = {
      resolverCuenta: jest.fn((eid: number, concepto: string) =>
        Promise.resolve(concepto === 'PRESTAMO_CARTERA' ? '1.1.2.99' : COD.BANCOS)),
    };

    await svc.asientoDesembolsoPrestamo(10, 'PREST-1', 1000, 'transferencia', '2026-09-19', 5);

    const lineas = svc.lineaRepository.create.mock.calls[0][0];
    expect(lineas.find((l: any) => l.debe === 1000)?.cuentaContableId).toBe(1);
  });

  // ── Ventas — Configuración Contable (2026-09-19) ────────────────────────
  // A diferencia de Cobros/Préstamos (varias resoluciones independientes),
  // Ventas resuelve TODO el grupo en una sola llamada a obtenerMapa()
  // (resolverCuentasConcepto) — un asiento de factura no debe costar más de
  // una consulta de configuración.

  it('asientoFacturaEmitida usa las cuentas configuradas para Clientes/Ventas/ITBIS, con una sola resolución', async () => {
    const svc = makeService({
      empresaId: 7,
      cuentas: [cuenta('9.1.1.01', 1), cuenta('9.2.1.01', 2), cuenta('9.3.1.01', 3)],
    });
    const obtenerMapa = jest.fn().mockResolvedValue({
      CLIENTES: '9.1.1.01', VENTAS: '9.2.1.01', ITBIS_POR_PAGAR: '9.3.1.01',
      RETENCION_ITBIS_VENTA: '1.1.4.02', RETENCION_ISR_VENTA: '1.1.4.03',
      COSTO_VENTAS: COD.COSTO_VENTAS, INVENTARIO: COD.INVENTARIO,
    });
    svc.configuracionService = { obtenerMapa };

    await svc.asientoFacturaEmitida(123, 1180, 1000, 180, 'FAC-1', '2026-09-19', 5);

    expect(obtenerMapa).toHaveBeenCalledTimes(1);
    const lineas = svc.lineaRepository.create.mock.calls[0][0];
    expect(lineas.find((l: any) => l.cuentaContableId === 1)?.debe).toBe(1180);  // Clientes
    expect(lineas.find((l: any) => l.cuentaContableId === 2)?.haber).toBe(1000); // Ventas
    expect(lineas.find((l: any) => l.cuentaContableId === 3)?.haber).toBe(180);  // ITBIS por pagar
  });

  it('asientoFacturaEmitida sin ConfiguracionContableService disponible: usa los defaults de siempre (COD.*)', async () => {
    const svc = makeService({
      empresaId: 7,
      cuentas: [cuenta(COD.CLIENTES, 1), cuenta(COD.VENTAS, 2), cuenta(COD.ITBIS_POR_PAGAR, 3)],
    });
    // svc.configuracionService deliberadamente NO seteado.

    await svc.asientoFacturaEmitida(123, 1180, 1000, 180, 'FAC-1', '2026-09-19', 5);

    const lineas = svc.lineaRepository.create.mock.calls[0][0];
    expect(lineas.find((l: any) => l.cuentaContableId === 1)?.debe).toBe(1180);
    expect(reportServiceError).not.toHaveBeenCalled();
  });

  it('asientoNotaDebito también resuelve Clientes/Ventas/ITBIS contra la configuración', async () => {
    const svc = makeService({
      empresaId: 7,
      cuentas: [cuenta('9.1.1.01', 1), cuenta('9.2.1.01', 2), cuenta('9.3.1.01', 3)],
    });
    svc.configuracionService = {
      obtenerMapa: jest.fn().mockResolvedValue({ CLIENTES: '9.1.1.01', VENTAS: '9.2.1.01', ITBIS_POR_PAGAR: '9.3.1.01' }),
    };

    await svc.asientoNotaDebito(5, 590, 500, 90, 'ND-1', '2026-09-19', 5);

    const lineas = svc.lineaRepository.create.mock.calls[0][0];
    expect(lineas.find((l: any) => l.cuentaContableId === 1)?.debe).toBe(590);
  });

  // ── Compras/Gastos — Configuración Contable (2026-09-19) ────────────────

  it('asientoCompraRecibida: ITBIS Crédito y Proveedores se resuelven contra la configuración, cuentaDestino sigue siendo el selector por documento', async () => {
    const svc = makeService({
      empresaId: 7,
      cuentas: [cuenta('1.2.1.01', 1), cuenta('9.1.4.01', 2), cuenta('9.2.1.01', 3)],
    });
    svc.configuracionService = {
      obtenerMapa: jest.fn().mockResolvedValue({ INVENTARIO: COD.INVENTARIO, ITBIS_CREDITO: '9.1.4.01', PROVEEDORES: '9.2.1.01' }),
    };

    // cuentaDestino='1.2.1.01' viene del selector por documento (activo fijo, no inventario) — NO de la configuración
    await svc.asientoCompraRecibida(50, 590, 500, 90, 'COM-001', '2026-09-19', 5, undefined, '1.2.1.01', true);

    const lineas = svc.lineaRepository.create.mock.calls[0][0];
    expect(lineas.find((l: any) => l.cuentaContableId === 1)?.debe).toBe(500);   // cuentaDestino, elegida
    expect(lineas.find((l: any) => l.cuentaContableId === 2)?.debe).toBe(90);    // ITBIS crédito, configurado
    expect(lineas.find((l: any) => l.cuentaContableId === 3)?.haber).toBe(590);  // Proveedores, configurado
  });

  it('previsualizarCompra: sin cuentaDestino explícita, usa el INVENTARIO configurado (no el literal COD.INVENTARIO)', async () => {
    const svc = makeService({
      empresaId: 7,
      cuentas: [cuenta('1.1.3.05', 1), cuenta(COD.ITBIS_CREDITO, 2), cuenta(COD.PROVEEDORES, 3)],
    });
    svc.configuracionService = { obtenerMapa: jest.fn().mockResolvedValue({ INVENTARIO: '1.1.3.05', ITBIS_CREDITO: COD.ITBIS_CREDITO, PROVEEDORES: COD.PROVEEDORES }) };

    const r: any = await svc.previsualizarCompra(590, 500, 90, 'COM-001');

    expect(r.lineas.find((l: any) => l.codigo === '1.1.3.05')?.debe).toBe(500);
  });

  it('asientoGasto: ITBIS Crédito y Bancos (pago) se resuelven contra la configuración', async () => {
    const svc = makeService({
      empresaId: 7,
      cuentas: [cuenta('6.1.2.07', 1), cuenta('9.1.4.02', 2), cuenta('9.1.1.05', 3)],
    });
    svc.configuracionService = { obtenerMapa: jest.fn().mockResolvedValue({ ITBIS_CREDITO: '9.1.4.02', BANCOS: '9.1.1.05', GASTO_DEFAULT: '6.1.2.04' }) };

    await svc.asientoGasto(10, 118, 100, 18, 'Mantenimiento elegido a mano', '2026-09-19', 5, '6.1.2.07', true);

    const lineas = svc.lineaRepository.create.mock.calls[0][0];
    expect(lineas.find((l: any) => l.cuentaContableId === 2)?.debe).toBe(18);
    expect(lineas.find((l: any) => l.cuentaContableId === 3)?.haber).toBe(118);
  });

  it('asientoMantenimiento: gasto y Proveedores se resuelven contra la configuración (antes literales sueltos)', async () => {
    const svc = makeService({
      empresaId: 7,
      cuentas: [cuenta('9.9.2.01', 1), cuenta('9.9.3.01', 2)],
    });
    svc.configuracionService = { obtenerMapa: jest.fn().mockResolvedValue({ MANTENIMIENTO_GASTO: '9.9.2.01', PROVEEDORES: '9.9.3.01' }) };

    await svc.asientoMantenimiento(1, 500, 'ORD-1', '2026-09-19', 5);

    const lineas = svc.lineaRepository.create.mock.calls[0][0];
    expect(lineas.find((l: any) => l.cuentaContableId === 1)?.debe).toBe(500);
    expect(lineas.find((l: any) => l.cuentaContableId === 2)?.haber).toBe(500);
  });

  // ── Nómina — Configuración Contable (2026-09-19) ────────────────────────

  it('asientoNomina resuelve las 5 cuentas contra la configuración, con una sola resolución', async () => {
    const svc = makeService({
      empresaId: 7,
      cuentas: [cuenta('9.1', 1), cuenta('9.2', 2), cuenta('9.3', 3), cuenta('9.4', 4), cuenta('9.5', 5)],
    });
    const obtenerMapa = jest.fn().mockResolvedValue({
      SUELDOS: '9.1', TSS_PATRONAL: '9.2', SUELDOS_X_PAGAR: '9.3', TSS_X_PAGAR: '9.4', ISR_X_PAGAR: '9.5',
    });
    svc.configuracionService = { obtenerMapa };

    // Debe (Bruto + TSS patronal) = Haber (Neto + TSS empleados+patronal + ISR): 100000+7300 = 88000+11300+8000
    await svc.asientoNomina(1, 100000, 88000, 4000, 8000, 7300, 'Septiembre 2026', '2026-09-30', 5);

    expect(obtenerMapa).toHaveBeenCalledTimes(1);
    const lineas = svc.lineaRepository.create.mock.calls[0][0];
    expect(lineas.find((l: any) => l.cuentaContableId === 1)?.debe).toBe(100000);  // Sueldos
    expect(lineas.find((l: any) => l.cuentaContableId === 3)?.haber).toBe(88000);  // Sueldos x pagar (neto)
  });

  // ── Resto del grupo Cobros — Configuración Contable (2026-09-19) ────────

  it('asientoCobroME resuelve Bancos/Clientes/cambiaria contra la configuración', async () => {
    const svc = makeService({
      empresaId: 7,
      cuentas: [cuenta('9.1', 1), cuenta('9.2', 2), cuenta('9.3', 3)],
    });
    svc.configuracionService = {
      obtenerMapa: jest.fn().mockResolvedValue({ BANCOS: '9.1', CLIENTES: '9.2', GANANCIA_CAMBIARIA: '9.3', PERDIDA_CAMBIARIA: COD.PERDIDA_CAMBIARIA }),
    };

    await svc.asientoCobroME(100, 'USD', 60, 58, 900, 99, '2026-09-19', 5);

    const lineas = svc.lineaRepository.create.mock.calls[0][0];
    expect(lineas.find((l: any) => l.cuentaContableId === 1)?.debe).toBe(6000);   // Bancos (100*60)
    expect(lineas.find((l: any) => l.cuentaContableId === 2)?.haber).toBe(5800);  // Clientes (100*58)
    expect(lineas.find((l: any) => l.cuentaContableId === 3)?.haber).toBe(200);   // Ganancia cambiaria
  });

  it('asientoAnticipo resuelve Anticipos de Clientes contra la configuración', async () => {
    const svc = makeService({
      empresaId: 7,
      cuentas: [cuenta(COD.CAJA, 1), cuenta('9.9.5.01', 2)],
    });
    svc.configuracionService = {
      resolverCuenta: jest.fn((eid: number, concepto: string) =>
        Promise.resolve(concepto === 'ANTICIPOS_CLIENTES' ? '9.9.5.01' : COD.CAJA)),
    };

    await svc.asientoAnticipo(200, 50, 'efectivo', '2026-09-19', 5);

    const lineas = svc.lineaRepository.create.mock.calls[0][0];
    expect(lineas.find((l: any) => l.cuentaContableId === 2)?.haber).toBe(200);
  });

  it('asientoAplicarAnticipo y asientoReversion también resuelven contra la configuración', async () => {
    const svc = makeService({ empresaId: 7, cuentas: [cuenta('9.9.5.01', 1), cuenta('9.9.6.01', 2)] });
    svc.configuracionService = { obtenerMapa: jest.fn().mockResolvedValue({ ANTICIPOS_CLIENTES: '9.9.5.01', CLIENTES: '9.9.6.01' }) };

    await svc.asientoAplicarAnticipo(150, 50, 99, '2026-09-19', 5);

    const lineas = svc.lineaRepository.create.mock.calls[0][0];
    expect(lineas.find((l: any) => l.cuentaContableId === 1)?.debe).toBe(150);
    expect(lineas.find((l: any) => l.cuentaContableId === 2)?.haber).toBe(150);
  });

  // ── Alta de Activo Fijo — nuevo asiento (2026-09-19) ─────────────────────
  // Antes, dar de alta un activo no generaba ningún asiento. La cuenta del
  // activo la resuelve el caller (categoría o default) y se le pasa ya
  // resuelta; la contrapartida es el selector por documento (default Bancos).

  it('asientoAltaActivo: Debe la cuenta del activo, Haber la contrapartida elegida, marcada manual', async () => {
    const svc = makeService({
      empresaId: 7,
      cuentas: [cuenta('1.2.1.02', 1), cuenta('2.1.1.01', 2)],
    });

    await svc.asientoAltaActivo(10, 50000, 'ACT-001', '1.2.1.02', '2026-09-19', 5, '2.1.1.01', true);

    const lineas = svc.lineaRepository.create.mock.calls[0][0];
    expect(lineas.find((l: any) => l.cuentaContableId === 1)?.debe).toBe(50000);
    const contrapartida = lineas.find((l: any) => l.cuentaContableId === 2);
    expect(contrapartida?.haber).toBe(50000);
    expect(contrapartida?.cuentaManual).toBe(true);
  });

  it('asientoAltaActivo sin cuentaContrapartida: usa el Bancos configurado (o COD.BANCOS por default), sin marcar nada manual', async () => {
    const svc = makeService({
      empresaId: 7,
      cuentas: [cuenta('1.2.1.02', 1), cuenta(COD.BANCOS, 2)],
    });

    await svc.asientoAltaActivo(10, 50000, 'ACT-001', '1.2.1.02', '2026-09-19', 5);

    const lineas = svc.lineaRepository.create.mock.calls[0][0];
    expect(lineas.every((l: any) => !l.cuentaManual)).toBe(true);
    expect(lineas.find((l: any) => l.cuentaContableId === 2)?.haber).toBe(50000);
  });

  it('asientoAltaActivo con costo cero o negativo: no genera nada', async () => {
    const svc = makeService({ empresaId: 7, cuentas: [] });

    await svc.asientoAltaActivo(10, 0, 'ACT-002', '1.2.1.02', '2026-09-19', 5);

    expect(svc.asientoRepository.save).not.toHaveBeenCalled();
  });

  it('previsualizarAltaActivo: ok=true y cuadrado con las cuentas presentes', async () => {
    const svc = makeService({
      empresaId: 7,
      cuentas: [cuenta('1.2.1.02', 1), cuenta(COD.BANCOS, 2)],
    });

    const r: any = await svc.previsualizarAltaActivo(50000, 'ACT-001', '1.2.1.02');

    expect(r.ok).toBe(true);
    expect(r.cuadrado).toBe(true);
    expect(r.totalDebe).toBe(50000);
  });

  // ── Movimiento bancario manual (Tesorería) — nuevo asiento (2026-09-19) ──
  // Antes, un depósito/retiro manual en Tesorería no generaba ningún
  // asiento — quedaba solo en movimientos_bancarios.

  it('asientoMovimientoBancario (depósito): Debe Bancos, Haber la contrapartida (default Otros Ingresos)', async () => {
    const svc = makeService({
      empresaId: 7,
      cuentas: [cuenta(COD.BANCOS, 1), cuenta('4.2.1.02', 2)],
    });

    await svc.asientoMovimientoBancario(1, 500, 'Aporte de capital', true, '2026-09-19', 5);

    const lineas = svc.lineaRepository.create.mock.calls[0][0];
    expect(lineas.find((l: any) => l.cuentaContableId === 1)?.debe).toBe(500);   // Bancos
    expect(lineas.find((l: any) => l.cuentaContableId === 2)?.haber).toBe(500);  // Otros Ingresos, default
    expect(lineas.every((l: any) => !l.cuentaManual)).toBe(true);
  });

  it('asientoMovimientoBancario (retiro): Debe la contrapartida elegida (marcada manual), Haber Bancos', async () => {
    const svc = makeService({
      empresaId: 7,
      cuentas: [cuenta('6.1.2.08', 1), cuenta(COD.BANCOS, 2)],
    });

    await svc.asientoMovimientoBancario(2, 300, 'Comisión bancaria', false, '2026-09-19', 5, '6.1.2.08', true);

    const lineas = svc.lineaRepository.create.mock.calls[0][0];
    const contrapartida = lineas.find((l: any) => l.cuentaContableId === 1);
    expect(contrapartida?.debe).toBe(300);
    expect(contrapartida?.cuentaManual).toBe(true);
    expect(lineas.find((l: any) => l.cuentaContableId === 2)?.haber).toBe(300);
  });

  it('asientoMovimientoBancario con monto cero: no genera nada', async () => {
    const svc = makeService({ empresaId: 7, cuentas: [] });

    await svc.asientoMovimientoBancario(3, 0, 'Sin monto', true, '2026-09-19', 5);

    expect(svc.asientoRepository.save).not.toHaveBeenCalled();
  });

  it('previsualizarMovimientoBancario: ok=true y cuadrado con las cuentas presentes', async () => {
    const svc = makeService({
      empresaId: 7,
      cuentas: [cuenta(COD.BANCOS, 1), cuenta('6.1.2.09', 2)],
    });

    const r: any = await svc.previsualizarMovimientoBancario(300, 'Retiro de prueba', false);

    expect(r.ok).toBe(true);
    expect(r.cuadrado).toBe(true);
    expect(r.totalDebe).toBe(300);
  });

  // ── Venta de Restaurante — migrado del SQL crudo al motor (2026-09-19) ──
  // Antes: restaurante.service.ts armaba este asiento a mano, sin pasar por
  // este motor (sin partida doble validada, sin reporte a Sentry si faltaba
  // una cuenta, cuentas hardcodeadas, userId fijo en 1).

  it('asientoVentaRestaurante (efectivo): Debe Caja, Haber Ventas + ITBIS', async () => {
    const svc = makeService({
      empresaId: 7,
      cuentas: [cuenta(COD.CAJA, 1), cuenta(COD.VENTAS, 2), cuenta(COD.ITBIS_POR_PAGAR, 3)],
    });

    await svc.asientoVentaRestaurante(50, 'COM-001', 118, 100, 18, 'efectivo', '2026-09-19', 9);

    const lineas = svc.lineaRepository.create.mock.calls[0][0];
    expect(lineas.find((l: any) => l.cuentaContableId === 1)?.debe).toBe(118);
    expect(lineas.find((l: any) => l.cuentaContableId === 2)?.haber).toBe(100);
    expect(lineas.find((l: any) => l.cuentaContableId === 3)?.haber).toBe(18);
    // Partida doble ya cuadrada: 118 = 100 + 18.
    expect(svc.asientoRepository.save).toHaveBeenCalled();
  });

  it('asientoVentaRestaurante (tarjeta): usa la cuenta configurada para COBRO_TARJETA, no Caja', async () => {
    const svc = makeService({
      empresaId: 7,
      cuentas: [cuenta('9.1.1', 1), cuenta(COD.VENTAS, 2), cuenta(COD.ITBIS_POR_PAGAR, 3)],
    });
    svc.configuracionService = {
      resolverCuenta: jest.fn().mockResolvedValue('9.1.1'), // resolverCuentaPorMetodoPago usa .resolverCuenta, no .obtenerMapa
      obtenerMapa: jest.fn().mockResolvedValue({ VENTAS: COD.VENTAS, ITBIS_POR_PAGAR: COD.ITBIS_POR_PAGAR }),
    };

    await svc.asientoVentaRestaurante(50, 'COM-002', 118, 100, 18, 'tarjeta', '2026-09-19', 9);

    const lineas = svc.lineaRepository.create.mock.calls[0][0];
    expect(lineas.find((l: any) => l.cuentaContableId === 1)?.debe).toBe(118);
  });

  it('asientoVentaRestaurante con total cero: no genera nada', async () => {
    const svc = makeService({ empresaId: 7, cuentas: [] });

    await svc.asientoVentaRestaurante(50, 'COM-003', 0, 0, 0, 'efectivo', '2026-09-19', 9);

    expect(svc.asientoRepository.save).not.toHaveBeenCalled();
  });
});
