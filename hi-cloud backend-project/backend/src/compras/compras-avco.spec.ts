import { ComprasService } from './compras.service';
import { CompraEstado } from './entities/compra.entity';

/**
 * Verifica que ComprasService actualiza el costo promedio (AVCO) cada vez
 * que mercancía entra al inventario, y solo entonces.
 *
 * Caminos cubiertos:
 *   1. cambiarEstado(BORRADOR → RECIBIDA)  — llama AVCO por cada detalle
 *   2. recibir()                            — llama AVCO solo por cantNueva
 *   3. costoUnitarioReal = 0               — no llama AVCO (bonificación pura)
 *   4. cambiarEstado(RECIBIDA → CANCELADA)  — no llama AVCO (salida, no entrada)
 */

// ── Helpers para construir mocks mínimos ─────────────────────────────────────

const PROD_ID  = 10;
const EMPRESA  = 1;
const USUARIO  = 9;
const COMPRA_ID = 99;

const makeDetalle = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  productoId:         PROD_ID,
  descripcion:        'Producto Test',
  cantidad:           5,
  cantidadBonificada: 1,
  cantidadTotal:      6,
  cantidadRecibida:   0,
  precioUnitario:     145,
  costoUnitarioReal:  120.50,
  porcentajeItbis:    18,
  subtotal:           725,
  importeItbis:       130.5,
  total:              855.5,
  ...overrides,
});

const makeCompra = (estado: CompraEstado, detalles: ReturnType<typeof makeDetalle>[]) => ({
  id:              COMPRA_ID,
  folio:           'COM-001',
  estado,
  usuarioId:       USUARIO,
  almacenId:       null,
  tipoPago:        'credito',
  diasCredito:     30,
  subtotal:        725,
  itbis:           130.5,
  total:           855.5,
  netoPagar:       855.5,
  retieneItbis:    false,
  retieneIsr:      false,
  montoRetencionItbis: 0,
  montoRetencionIsr:   0,
  detalles,
  empresaId:       EMPRESA,
});

interface Deps {
  compraRepo:          Record<string, jest.Mock>;
  detalleRepo:         Record<string, jest.Mock>;
  inventarioSvc:       Record<string, jest.Mock>;
  valoracionSvc:       Record<string, jest.Mock>;
  cxpSvc:              Record<string, jest.Mock>;
  asientosSvc:         Record<string, jest.Mock>;
  tenantSvc:           { getEmpresaId: () => number; getAlmacenId: () => null; getSucursalId: () => null; resolveSucursalId: jest.Mock };
  realtimeSvc:         Record<string, jest.Mock>;
  gastosImportacionSvc: Record<string, jest.Mock>;
  ds:                  Record<string, jest.Mock>;
}

function buildDeps(mockCompra: ReturnType<typeof makeCompra>): Deps {
  return {
    compraRepo: {
      findOne: jest.fn().mockResolvedValue(mockCompra),
      update:  jest.fn().mockResolvedValue(undefined),
    },
    detalleRepo: {
      update: jest.fn().mockResolvedValue(undefined),
    },
    inventarioSvc: {
      registrarEntrada:    jest.fn().mockResolvedValue(undefined),
      registrarDevolucion: jest.fn().mockResolvedValue(undefined),
    },
    valoracionSvc: {
      actualizarCostoPromedio: jest.fn().mockResolvedValue(undefined),
    },
    cxpSvc: {
      crear: jest.fn().mockResolvedValue(undefined),
    },
    asientosSvc: {
      asientoCompraRecibida: jest.fn().mockResolvedValue(undefined),
    },
    tenantSvc: {
      getEmpresaId:      () => EMPRESA,
      getAlmacenId:      () => null,
      getSucursalId:     () => null,
      resolveSucursalId: jest.fn().mockResolvedValue(null),
    },
    realtimeSvc: {
      notify: jest.fn(),
    },
    // GastosImportacionService — usado en cambiarEstado/recibir para sumar
    // costos de importación al AVCO al momento de la recepción.
    gastosImportacionSvc: {
      getCostosImportacionPorUnidad: jest.fn().mockResolvedValue(new Map()),
      aplicarGastosPendientes:       jest.fn().mockResolvedValue(undefined),
    },
    ds: {
      query: jest.fn().mockResolvedValue([]),
    },
  };
}

function buildService(d: Deps): ComprasService {
  return new ComprasService(
    d.compraRepo as any,
    d.detalleRepo as any,
    {} as any,                    // proveedoresService (no se usa en estos caminos)
    {} as any,                    // productosService
    d.inventarioSvc as any,
    d.valoracionSvc as any,
    d.cxpSvc as any,
    d.asientosSvc as any,
    d.tenantSvc as any,
    d.realtimeSvc as any,
    d.gastosImportacionSvc as any, // posición 11 — GastosImportacionService
    d.ds as any,                   // posición 12 — DataSource
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ComprasService — AVCO (actualizarCostoPromedio)', () => {

  it('llama actualizarCostoPromedio al cambiar estado a RECIBIDA', async () => {
    const det     = makeDetalle();
    const compra  = makeCompra(CompraEstado.BORRADOR, [det]);
    const d       = buildDeps(compra);
    const service = buildService(d);

    await service.cambiarEstado(COMPRA_ID, CompraEstado.RECIBIDA);

    expect(d.valoracionSvc.actualizarCostoPromedio).toHaveBeenCalledTimes(1);
    expect(d.valoracionSvc.actualizarCostoPromedio).toHaveBeenCalledWith(
      PROD_ID,
      6,       // cantidadTotal (5 fact + 1 bonif)
      120.50,  // costoUnitarioReal
    );
  });

  it('llama actualizarCostoPromedio en recibir() solo por la cantNueva', async () => {
    // El detalle ya tiene 3 unidades recibidas de 6; quedan 3 pendientes.
    const det    = makeDetalle({ cantidadRecibida: 3 });
    const compra = makeCompra(CompraEstado.RECIBIDA_PARCIAL, [det]);
    const d      = buildDeps(compra);
    const service = buildService(d);

    await service.recibir(
      COMPRA_ID,
      { detalles: [{ detalleId: 1, cantidadRecibida: 3 }] },
      { id: USUARIO },
    );

    // Solo las 3 nuevas unidades, no las 6 totales
    expect(d.valoracionSvc.actualizarCostoPromedio).toHaveBeenCalledTimes(1);
    expect(d.valoracionSvc.actualizarCostoPromedio).toHaveBeenCalledWith(
      PROD_ID,
      3,
      120.50,
    );
  });

  it('NO llama actualizarCostoPromedio cuando costoUnitarioReal es 0 (bonificación pura)', async () => {
    const det    = makeDetalle({ costoUnitarioReal: 0, precioUnitario: 0 });
    const compra = makeCompra(CompraEstado.BORRADOR, [det]);
    const d      = buildDeps(compra);
    const service = buildService(d);

    await service.cambiarEstado(COMPRA_ID, CompraEstado.RECIBIDA);

    // El stock sí entra, pero AVCO no se toca (no contaminar el costo)
    expect(d.inventarioSvc.registrarEntrada).toHaveBeenCalledTimes(1);
    expect(d.valoracionSvc.actualizarCostoPromedio).not.toHaveBeenCalled();
  });

  it('NO llama actualizarCostoPromedio al cancelar una compra recibida (salida de stock)', async () => {
    const det    = makeDetalle();
    const compra = makeCompra(CompraEstado.RECIBIDA, [det]);
    const d      = buildDeps(compra);
    const service = buildService(d);

    await service.cambiarEstado(COMPRA_ID, CompraEstado.CANCELADA);

    expect(d.inventarioSvc.registrarDevolucion).toHaveBeenCalledTimes(1);
    expect(d.valoracionSvc.actualizarCostoPromedio).not.toHaveBeenCalled();
  });

});
