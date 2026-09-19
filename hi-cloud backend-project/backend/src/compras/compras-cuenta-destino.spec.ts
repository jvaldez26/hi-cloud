import { ComprasService } from './compras.service';
import { CompraEstado } from './entities/compra.entity';

/**
 * Selector de cuenta contable en Compras (2026-09-19) — la misma factura
 * puede ser gasto, activo fijo o inventario; el asiento automático siempre
 * iba a Inventario sin importar esto. Cubre:
 *   1. cambiarEstado(RECIBIDA) pasa compra.cuentaDestino y lo marca manual.
 *   2. Sin cuentaDestino (NULL, el caso de siempre): usa el default del
 *      motor y NO lo marca como manual.
 *   3. previsualizarAsiento() delega en el motor (previsualizarCompra) sin
 *      replicar el cálculo del asiento — solo arma subtotal/ITBIS con la
 *      MISMA lógica que create() (calcularDetalles()).
 */

const PROD_ID   = 10;
const EMPRESA   = 1;
const USUARIO   = 9;
const COMPRA_ID = 99;

const makeDetalle = (overrides: Record<string, unknown> = {}) => ({
  id: 1, productoId: PROD_ID, descripcion: 'Producto Test',
  cantidad: 5, cantidadBonificada: 0, cantidadTotal: 5, cantidadRecibida: 0,
  precioUnitario: 100, costoUnitarioReal: 100, porcentajeItbis: 18,
  subtotal: 500, importeItbis: 90, total: 590,
  ...overrides,
});

const makeCompra = (estado: CompraEstado, extra: Record<string, unknown> = {}) => ({
  id: COMPRA_ID, folio: 'COM-001', estado, usuarioId: USUARIO, almacenId: null,
  tipoPago: 'credito', diasCredito: 30, subtotal: 500, itbis: 90, total: 590,
  netoPagar: 590, retieneItbis: false, retieneIsr: false,
  montoRetencionItbis: 0, montoRetencionIsr: 0, detalles: [makeDetalle()], empresaId: EMPRESA,
  cuentaDestino: null,
  ...extra,
});

function buildDeps(mockCompra: ReturnType<typeof makeCompra>) {
  return {
    compraRepo: { findOne: jest.fn().mockResolvedValue(mockCompra), update: jest.fn().mockResolvedValue(undefined) },
    detalleRepo: { update: jest.fn().mockResolvedValue(undefined) },
    productosService: {
      findByIds: jest.fn().mockResolvedValue(new Map([[PROD_ID, { id: PROD_ID, nombre: 'Producto Test' }]])),
    },
    inventarioSvc: { registrarEntrada: jest.fn().mockResolvedValue({ cantidadAnterior: 0 }), registrarDevolucion: jest.fn() },
    valoracionSvc: { actualizarCostoPromedio: jest.fn().mockResolvedValue(undefined) },
    cxpSvc: { crear: jest.fn().mockResolvedValue(undefined) },
    asientosSvc: {
      asientoCompraRecibida: jest.fn().mockResolvedValue(undefined),
      previsualizarCompra:   jest.fn().mockResolvedValue({ ok: true, lineas: [], totalDebe: 0, totalHaber: 0, cuadrado: true }),
    },
    tenantSvc: { getEmpresaId: () => EMPRESA, getAlmacenId: () => null, getSucursalId: () => null, resolveSucursalId: jest.fn().mockResolvedValue(null) },
    realtimeSvc: { notify: jest.fn() },
    gastosImportacionSvc: { getCostosImportacionPorUnidad: jest.fn().mockResolvedValue(new Map()), aplicarGastosPendientes: jest.fn().mockResolvedValue(undefined) },
    ds: { query: jest.fn().mockResolvedValue([]) },
  };
}

function buildService(d: ReturnType<typeof buildDeps>): ComprasService {
  return new ComprasService(
    d.compraRepo as any,
    d.detalleRepo as any,
    {} as any,                                   // proveedoresService
    d.productosService as any,
    { registrarDesdeCompra: jest.fn() } as any,   // productoProveedorSvc
    d.inventarioSvc as any,
    d.valoracionSvc as any,
    d.cxpSvc as any,
    d.asientosSvc as any,
    d.tenantSvc as any,
    d.realtimeSvc as any,
    d.gastosImportacionSvc as any,
    d.ds as any,
  );
}

describe('ComprasService — selector de cuenta contable (cuentaDestino)', () => {
  it('cambiarEstado(RECIBIDA) con cuentaDestino elegida: la pasa al motor y la marca manual', async () => {
    const compra  = makeCompra(CompraEstado.BORRADOR, { cuentaDestino: '1.2.1.01' }); // activo fijo, no inventario
    const d       = buildDeps(compra);
    const service = buildService(d);

    await service.cambiarEstado(COMPRA_ID, CompraEstado.RECIBIDA);

    const llamada = d.asientosSvc.asientoCompraRecibida.mock.calls[0];
    expect(llamada[8]).toBe('1.2.1.01'); // cuentaDestino (9no parámetro, índice 8)
    expect(llamada[9]).toBe(true);       // cuentaDestinoManual
  });

  it('cambiarEstado(RECIBIDA) sin cuentaDestino (NULL, el caso de siempre): no marca nada como manual', async () => {
    const compra  = makeCompra(CompraEstado.BORRADOR, { cuentaDestino: null });
    const d       = buildDeps(compra);
    const service = buildService(d);

    await service.cambiarEstado(COMPRA_ID, CompraEstado.RECIBIDA);

    const llamada = d.asientosSvc.asientoCompraRecibida.mock.calls[0];
    expect(llamada[8]).toBeUndefined();  // deja que el motor use su propio default (Inventario)
    expect(llamada[9]).toBe(false);
  });

  it('previsualizarAsiento() delega en el motor con subtotal/ITBIS calculados igual que create()', async () => {
    const compra  = makeCompra(CompraEstado.BORRADOR, { cuentaDestino: '6.1.2.04' });
    const d       = buildDeps(compra);
    const service = buildService(d);

    await service.previsualizarAsiento({
      proveedorId: 1, fecha: '2026-09-19',
      detalles: [{ productoId: PROD_ID, cantidad: 5, precioUnitario: 100, porcentajeItbis: 18 }],
      cuentaDestino: '6.1.2.04',
    } as any);

    expect(d.asientosSvc.previsualizarCompra).toHaveBeenCalledWith(
      590, 500, 90, 'OC-VISTA-PREVIA', undefined, '6.1.2.04',
    );
  });

  it('previsualizarAsiento() incluye retenciones cuando el dto las trae', async () => {
    const compra  = makeCompra(CompraEstado.BORRADOR);
    const d       = buildDeps(compra);
    const service = buildService(d);

    await service.previsualizarAsiento({
      proveedorId: 1, fecha: '2026-09-19',
      detalles: [{ productoId: PROD_ID, cantidad: 5, precioUnitario: 100, porcentajeItbis: 18 }],
      retieneItbis: true, porcentajeRetencionItbis: 30,
    } as any);

    const llamada = d.asientosSvc.previsualizarCompra.mock.calls[0];
    expect(llamada[4]).toEqual({ montoItbis: 27, montoIsr: 0, netoPagar: 563 }); // 90*0.30=27, 590-27=563
  });
});
