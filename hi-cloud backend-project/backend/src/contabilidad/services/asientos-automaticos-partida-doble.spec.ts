/**
 * P3 BLOQUE 1 — AsientosAutomaticosService valida partida doble antes de
 * persistir, mismo umbral que ContabilidadService.createAsiento()
 * (Math.abs(totalDebe - totalHaber) > 0.01). Antes de este bloque, el motor
 * automático — que corre en el 100% de las operaciones — no validaba nada:
 * un builder de líneas con un bug podía posetear un asiento descuadrado sin
 * que nadie se enterara hasta el cierre.
 *
 * Un asiento descuadrado en los libros es peor que ninguno: se reporta a
 * Sentry con el detalle completo (incluidas las líneas) y se descarta
 * (TIPO B — nunca rompe la operación que lo llamó), igual que "cuenta no
 * encontrada".
 */

import { AsientosAutomaticosService } from './asientos-automaticos.service';
import { TipoOrigenAsiento } from '../entities/asiento-contable.entity';
import { reportServiceError } from '../../common/observability/sentry';

jest.mock('../../common/observability/sentry', () => ({
  reportServiceError: jest.fn(),
}));

const cuenta = (codigo: string, id: number) =>
  ({ id, codigo, isActive: true, permiteMovimientos: true }) as any;

function makeService(cuentas: any[]) {
  const cuentaRepository = { find: jest.fn().mockResolvedValue(cuentas) };
  const asientoRepository = {
    create: jest.fn((data: any) => data),
    save:   jest.fn(async (data: any) => ({ id: 1, ...data })),
  };
  const lineaRepository = {
    create: jest.fn((data: any) => data),
    save:   jest.fn(async (data: any) => data),
  };
  const tenantService = { getEmpresaId: () => 7 };
  const dataSource = { query: jest.fn().mockResolvedValue([{ numero: 1 }]) };

  const svc: any = Object.create(AsientosAutomaticosService.prototype);
  svc.logger            = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
  svc.cuentaRepository  = cuentaRepository;
  svc.asientoRepository = asientoRepository;
  svc.lineaRepository   = lineaRepository;
  svc.tenantService     = tenantService;
  svc.dataSource        = dataSource;
  return { svc: svc as AsientosAutomaticosService, asientoRepository, lineaRepository };
}

beforeEach(() => jest.clearAllMocks());

describe('AsientosAutomaticosService — partida doble (P3 Bloque 1)', () => {
  it('asiento descuadrado: NO se persiste (ni el encabezado ni las líneas), reporta a Sentry con las líneas, y devuelve null', async () => {
    const { svc, asientoRepository, lineaRepository } = makeService([
      cuenta('1.1.1.02', 1), cuenta('1.1.2.01', 2),
    ]);

    const resultado = await svc.crearAsientoContabilizado({
      descripcion:     'Asiento de prueba descuadrado',
      tipoOrigen:      TipoOrigenAsiento.AJUSTE,
      referenciaId:    999,
      referenciaFolio: 'TEST-999',
      userId:          5,
      lineas: [
        { codigo: '1.1.1.02', descripcion: 'Debe', debe: 100, haber: 0 },
        { codigo: '1.1.2.01', descripcion: 'Haber', debe: 0, haber: 90 }, // 10 de diferencia
      ],
    });

    expect(resultado).toBeNull();
    expect(asientoRepository.save).not.toHaveBeenCalled();
    expect(lineaRepository.save).not.toHaveBeenCalled();
    expect(reportServiceError).toHaveBeenCalledWith(
      expect.any(Error),
      'asiento_descuadrado',
      expect.objectContaining({
        tipoOrigen:      TipoOrigenAsiento.AJUSTE,
        referenciaId:    '999',
        referenciaFolio: 'TEST-999',
        lineas:          expect.stringContaining('"debe":100'),
      }),
    );
  });

  it('diferencia menor o igual a 0.01 (redondeo) SÍ se persiste — mismo umbral que el camino manual', async () => {
    const { svc, asientoRepository } = makeService([
      cuenta('1.1.1.02', 1), cuenta('1.1.2.01', 2),
    ]);

    const resultado = await svc.crearAsientoContabilizado({
      descripcion:     'Asiento con redondeo aceptable',
      tipoOrigen:      TipoOrigenAsiento.AJUSTE,
      referenciaId:    1,
      referenciaFolio: 'TEST-1',
      userId:          5,
      lineas: [
        { codigo: '1.1.1.02', descripcion: 'Debe', debe: 100.005, haber: 0 },
        { codigo: '1.1.2.01', descripcion: 'Haber', debe: 0, haber: 100 },
      ],
    });

    expect(resultado).not.toBeNull();
    expect(asientoRepository.save).toHaveBeenCalled();
    expect(reportServiceError).not.toHaveBeenCalledWith(expect.any(Error), 'asiento_descuadrado', expect.anything());
  });

  it('redondeo de centavos (≤0.01): se corrige EN LA LÍNEA DE ITBIS, el asiento queda EXACTO', async () => {
    // Balance/Diagnóstico (2026-09-20) — antes de este fix, un diferencial de
    // hasta 0.01 se toleraba TAL CUAL (guardado descuadrado por un centavo).
    // Ahora se corrige en el origen: nunca se persiste un asiento con la
    // diferencia todavía presente, si es del tamaño de un redondeo.
    const { svc, asientoRepository, lineaRepository } = makeService([
      cuenta('1.1.2.01', 1), cuenta('4.1.1.01', 2), cuenta('2.1.2.01', 3), // ITBIS_POR_PAGAR
    ]);

    const resultado = await svc.crearAsientoContabilizado({
      descripcion:     'Factura con ITBIS sumado por línea',
      tipoOrigen:      TipoOrigenAsiento.FACTURA,
      referenciaId:    2,
      referenciaFolio: 'FAC-2',
      userId:          5,
      lineas: [
        { codigo: '1.1.2.01', descripcion: 'CxC',    debe: 1180.01, haber: 0 },
        { codigo: '4.1.1.01', descripcion: 'Ventas', debe: 0,       haber: 1000 },
        { codigo: '2.1.2.01', descripcion: 'ITBIS',  debe: 0,       haber: 180 }, // faltaba 0.01
      ],
    });

    expect(resultado).not.toBeNull();
    const lineasGuardadas = (lineaRepository.save as jest.Mock).mock.calls[0][0] as any[];
    const totalDebe  = lineasGuardadas.reduce((s: number, l: any) => s + l.debe,  0);
    const totalHaber = lineasGuardadas.reduce((s: number, l: any) => s + l.haber, 0);
    expect(totalDebe).toBe(totalHaber); // EXACTO, no solo "dentro de 0.01"

    const lineaItbis = lineasGuardadas.find((l: any) => l.cuentaContableId === 3);
    expect(lineaItbis.haber).toBe(180.01); // el centavo se le sumó a ITBIS, no a Ventas ni a CxC
    expect(asientoRepository.save).toHaveBeenCalled();
  });

  it('redondeo de centavos sin línea de ITBIS: se corrige en la línea de MAYOR MONTO', async () => {
    const { svc, lineaRepository } = makeService([
      cuenta('1.1.1.02', 1), cuenta('1.1.2.01', 2), // sin ninguna cuenta ITBIS
    ]);

    const resultado = await svc.crearAsientoContabilizado({
      descripcion:     'Cobro con redondeo, sin ITBIS en el asiento',
      tipoOrigen:      TipoOrigenAsiento.COBRO,
      referenciaId:    3,
      referenciaFolio: 'COB-3',
      userId:          5,
      lineas: [
        { codigo: '1.1.1.02', descripcion: 'Caja',     debe: 5000,    haber: 0 },
        { codigo: '1.1.2.01', descripcion: 'Clientes', debe: 0,       haber: 4999.99 },
      ],
    });

    expect(resultado).not.toBeNull();
    const lineasGuardadas = (lineaRepository.save as jest.Mock).mock.calls[0][0] as any[];
    const totalDebe  = lineasGuardadas.reduce((s: number, l: any) => s + l.debe,  0);
    const totalHaber = lineasGuardadas.reduce((s: number, l: any) => s + l.haber, 0);
    expect(totalDebe).toBe(totalHaber);

    // La línea de mayor monto es Caja (5000 > 4999.99) — se le resta el centavo, no se toca Clientes.
    const lineaCaja = lineasGuardadas.find((l: any) => l.cuentaContableId === 1);
    const lineaClientes = lineasGuardadas.find((l: any) => l.cuentaContableId === 2);
    expect(lineaCaja.debe).toBe(4999.99);
    expect(lineaClientes.haber).toBe(4999.99);
  });

  it('diferencia mayor a 0.01 NO se corrige — sigue siendo un bug real, se rechaza (no esconde el error)', async () => {
    const { svc, asientoRepository, lineaRepository } = makeService([
      cuenta('1.1.1.02', 1), cuenta('4.1.1.01', 2), cuenta('2.1.2.01', 3),
    ]);

    const resultado = await svc.crearAsientoContabilizado({
      descripcion:     'Asiento con diferencia real, no de redondeo',
      tipoOrigen:      TipoOrigenAsiento.AJUSTE,
      referenciaId:    4,
      referenciaFolio: 'TEST-4',
      userId:          5,
      lineas: [
        { codigo: '1.1.1.02', descripcion: 'Debe',  debe: 100,   haber: 0 },
        { codigo: '2.1.2.01', descripcion: 'ITBIS', debe: 0,     haber: 99.90 }, // 0.10 de diferencia
      ],
    });

    expect(resultado).toBeNull();
    expect(asientoRepository.save).not.toHaveBeenCalled();
    expect(lineaRepository.save).not.toHaveBeenCalled();
    expect(reportServiceError).toHaveBeenCalledWith(expect.any(Error), 'asiento_descuadrado', expect.anything());
  });

  it('asiento balanceado sigue generándose normal (regresión)', async () => {
    const { svc, asientoRepository } = makeService([
      cuenta('1.1.1.03', 1), cuenta('1.1.2.01', 2), cuenta('4.1.1.01', 3), cuenta('2.1.2.01', 4),
    ]);

    const resultado = await svc.crearAsientoContabilizado({
      descripcion:     'Asiento balanceado',
      tipoOrigen:      TipoOrigenAsiento.FACTURA,
      referenciaId:    1,
      referenciaFolio: 'FAC-1',
      userId:          5,
      lineas: [
        { codigo: '1.1.2.01', descripcion: 'CxC',    debe: 1180, haber: 0 },
        { codigo: '4.1.1.01', descripcion: 'Ventas', debe: 0,    haber: 1000 },
        { codigo: '2.1.2.01', descripcion: 'ITBIS',  debe: 0,    haber: 180 },
      ],
    });

    expect(resultado).not.toBeNull();
    expect(asientoRepository.save).toHaveBeenCalled();
  });

  it('asientoFacturaEmitida con línea de costo de venta (la más nueva del builder): el asiento resultante sigue cuadrando y se persiste', async () => {
    // DR Costo de Ventas / CR Inventario se agrega dentro de asientoFacturaEmitida()
    // cuando resolverCostoVenta() encuentra costoUnitario>0 en factura_detalles —
    // esta es justo la línea que el diagnóstico de P3 señaló como la más nueva y
    // con más riesgo de descuadrar el asiento si algún día se calcula mal.
    const { svc, asientoRepository, lineaRepository } = makeService([
      cuenta('1.1.2.01', 1), cuenta('4.1.1.01', 2), cuenta('2.1.2.01', 3),
      cuenta('5.1.1.01', 4), cuenta('1.1.3.01', 5), // COSTO_VENTAS, INVENTARIO
    ]);
    svc['dataSource'].query.mockImplementation((sql: string) => {
      if (sql.includes('factura_detalles')) {
        return Promise.resolve([{ productoId: 10, cantidad: '2', costoUnitario: '50.00' }]);
      }
      return Promise.resolve([{ numero: 1 }]);
    });

    await svc.asientoFacturaEmitida(123, 1180, 1000, 180, 'FAC-1', 5);

    expect(asientoRepository.save).toHaveBeenCalled();
    expect(lineaRepository.save).toHaveBeenCalled();
    const lineasGuardadas = (lineaRepository.save as jest.Mock).mock.calls[0][0] as any[];
    const totalDebe  = lineasGuardadas.reduce((s, l) => s + l.debe, 0);
    const totalHaber = lineasGuardadas.reduce((s, l) => s + l.haber, 0);
    expect(Math.abs(totalDebe - totalHaber)).toBeLessThanOrEqual(0.01);
    expect(svc['logger'].warn).not.toHaveBeenCalledWith(expect.stringContaining('DESCUADRADO'));
  });
});
