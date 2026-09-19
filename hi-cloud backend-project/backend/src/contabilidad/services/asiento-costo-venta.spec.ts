/**
 * Costo de venta en asientoFacturaEmitida() — DR Costo de Ventas (5.1.1.01) /
 * CR Inventario (1.1.3.01), por costoUnitario × cantidad de las líneas de
 * factura respaldadas por un producto (factura_detalles."productoId" IS NOT
 * NULL). AVCO ya calculaba costoUnitario al recibir compras y lo fotografiaba
 * en factura_detalles al vender — lo que faltaba era solo este asiento.
 *
 * Un producto sin historial de compras (costoUnitario = 0) NUNCA genera la
 * línea — un asiento de costo cero se ve contabilizado sin estarlo, peor que
 * no tenerlo — y se reporta a Sentry en vez de contabilizar en silencio.
 * Una factura de puro servicio (sin ninguna línea con producto) tampoco
 * genera la línea, pero sin avisar a nadie: no le falta nada.
 */

import { AsientosAutomaticosService } from './asientos-automaticos.service';
import { reportServiceError } from '../../common/observability/sentry';

jest.mock('../../common/observability/sentry', () => ({
  reportServiceError: jest.fn(),
}));

const cuenta = (codigo: string, id: number) =>
  ({ id, codigo, isActive: true, permiteMovimientos: true }) as any;

// CLIENTES, VENTAS, ITBIS_POR_PAGAR, COSTO_VENTAS, INVENTARIO
const CUENTAS = [
  cuenta('1.1.2.01', 1),
  cuenta('4.1.1.01', 2),
  cuenta('2.1.2.01', 3),
  cuenta('5.1.1.01', 4),
  cuenta('1.1.3.01', 5),
];

function makeService(filasFacturaDetalle: any[]) {
  const cuentaRepository = { find: jest.fn().mockResolvedValue(CUENTAS) };
  const asientoRepository = {
    create: jest.fn((data: any) => data),
    save:   jest.fn(async (data: any) => ({ id: 1, ...data })),
  };
  const lineaRepository = {
    create: jest.fn((data: any) => data),
    save:   jest.fn(async (data: any) => data),
  };
  const tenantService = { getEmpresaId: () => 7 };
  const dataSource = {
    // Orden real de llamadas dentro de asientoFacturaEmitida():
    // 1) resolverCostoVenta() lee factura_detalles.
    // 2) _crearAsientoContabilizado() → generarNumero() → siguiente_numero_secuencia.
    query: jest.fn()
      .mockResolvedValueOnce(filasFacturaDetalle)
      .mockResolvedValueOnce([{ numero: 1 }]),
  };

  const svc: any = Object.create(AsientosAutomaticosService.prototype);
  svc.logger            = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
  svc.cuentaRepository  = cuentaRepository;
  svc.asientoRepository = asientoRepository;
  svc.lineaRepository   = lineaRepository;
  svc.tenantService     = tenantService;
  svc.dataSource        = dataSource;
  return { svc: svc as AsientosAutomaticosService, lineaRepository };
}

beforeEach(() => jest.clearAllMocks());

describe('AsientosAutomaticosService.asientoFacturaEmitida() — costo de venta', () => {
  it('con costoUnitario real: agrega DR Costo de Ventas / CR Inventario y el asiento sigue cuadrando', async () => {
    const { svc, lineaRepository } = makeService([
      { productoId: 10, cantidad: '2.0000', costoUnitario: '150.0000' },
      { productoId: 11, cantidad: '1.0000', costoUnitario: '50.0000' },
    ]);
    await svc.asientoFacturaEmitida(123, 1180, 1000, 180, 'FAC-1', 5);

    const lineas = lineaRepository.save.mock.calls[0][0] as any[];
    const costo       = lineas.find(l => l.cuentaContableId === 4); // COSTO_VENTAS
    const inventario   = lineas.find(l => l.cuentaContableId === 5); // INVENTARIO
    expect(costo).toBeDefined();
    expect(inventario).toBeDefined();
    expect(costo.debe).toBeCloseTo(350, 2);      // 2×150 + 1×50
    expect(inventario.haber).toBeCloseTo(350, 2);

    const totalDebe  = lineas.reduce((s, l) => s + l.debe,  0);
    const totalHaber = lineas.reduce((s, l) => s + l.haber, 0);
    expect(totalDebe).toBeCloseTo(totalHaber, 2); // partida doble sigue cuadrando

    expect(reportServiceError).not.toHaveBeenCalled();
  });

  it('producto sin historial de compras (costoUnitario=0): NO genera la línea y reporta a Sentry', async () => {
    const { svc, lineaRepository } = makeService([
      { productoId: 10, cantidad: '1.0000', costoUnitario: '0.0000' },
    ]);
    await svc.asientoFacturaEmitida(123, 1180, 1000, 180, 'FAC-2', 5);

    const lineas = lineaRepository.save.mock.calls[0][0] as any[];
    expect(lineas.some(l => l.cuentaContableId === 4)).toBe(false);
    expect(lineas.some(l => l.cuentaContableId === 5)).toBe(false);
    // El resto del asiento (Clientes/Ventas/ITBIS) se contabiliza igual —
    // un producto sin costo no debe tumbar el resto de la venta.
    expect(lineas.length).toBe(3);

    expect(reportServiceError).toHaveBeenCalledWith(
      expect.any(Error),
      'asiento_costo_venta_sin_historial',
      expect.objectContaining({ referenciaId: '123', referenciaFolio: 'FAC-2', productoIds: '10' }),
    );
  });

  it('una sola línea sin historial entre varias con costo real: omite TODO el costo de venta, no un total parcial', async () => {
    const { svc, lineaRepository } = makeService([
      { productoId: 10, cantidad: '2.0000', costoUnitario: '150.0000' },
      { productoId: 12, cantidad: '1.0000', costoUnitario: '0.0000' }, // sin historial
    ]);
    await svc.asientoFacturaEmitida(123, 1180, 1000, 180, 'FAC-3', 5);

    const lineas = lineaRepository.save.mock.calls[0][0] as any[];
    expect(lineas.some(l => l.cuentaContableId === 4)).toBe(false);
    expect(reportServiceError).toHaveBeenCalledWith(
      expect.any(Error),
      'asiento_costo_venta_sin_historial',
      expect.objectContaining({ productoIds: '12' }),
    );
  });

  it('factura de puro servicio (sin ninguna línea con producto): no genera la línea, sin avisar a nadie', async () => {
    const { svc, lineaRepository } = makeService([
      { productoId: null, cantidad: '1.0000', costoUnitario: '0.0000' },
    ]);
    await svc.asientoFacturaEmitida(123, 1180, 1000, 180, 'FAC-4', 5);

    const lineas = lineaRepository.save.mock.calls[0][0] as any[];
    expect(lineas.some(l => l.cuentaContableId === 4)).toBe(false);
    expect(lineas.some(l => l.cuentaContableId === 5)).toBe(false);
    expect(reportServiceError).not.toHaveBeenCalled();
  });
});
