import { ComprasService } from './compras.service';
import { CompraEstado } from './entities/compra.entity';

/**
 * FIX — pre-requisito de HiCloud Xlink (2026-09-29).
 *
 * InventarioService.registrarSalida() ya se corta para productos de tipo
 * 'servicio' (no tienen inventario físico), pero registrarEntrada() y
 * ValoracionStockService.actualizarCostoPromedio() no tenían guarda propia
 * — la disciplina vivía solo en los CALLERS externos. Una compra recibida
 * con una línea de servicio (ej. flete, instalación) llamaría igual a
 * registrarEntrada/AVCO para esa línea, sumando stock/costo a algo que
 * nunca fue a un almacén.
 *
 * El fix vive en los dos loops de ComprasService (cambiarEstado→RECIBIDA y
 * recibir()), no dentro de InventarioService — mismo criterio explícito
 * pedido: comprobar `detalle.producto?.tipo === 'servicio'` con la relación
 * ya cargada por findOne() (relations: ['detalles.producto']) y saltar
 * inventario/AVCO para esa línea, pero seguir acumulando cantidadRecibida.
 */

const PROD_FISICO  = 10;
const PROD_SERVICIO = 20;
const EMPRESA  = 1;
const USUARIO  = 9;
const COMPRA_ID = 99;

const makeDetalle = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  productoId:         PROD_FISICO,
  producto:           { id: PROD_FISICO, tipo: 'producto' },
  descripcion:        'Producto Test',
  cantidad:           5,
  cantidadBonificada: 0,
  cantidadTotal:      5,
  cantidadRecibida:   0,
  precioUnitario:     100,
  costoUnitarioReal:  100,
  porcentajeItbis:    18,
  subtotal:           500,
  importeItbis:       90,
  total:              590,
  ...overrides,
});

const makeDetalleServicio = (overrides: Record<string, unknown> = {}) => makeDetalle({
  id:          2,
  productoId:  PROD_SERVICIO,
  producto:    { id: PROD_SERVICIO, tipo: 'servicio' },
  descripcion: 'Instalación',
  cantidad:    1,
  cantidadTotal: 1,
  precioUnitario: 300,
  costoUnitarioReal: 300,
  subtotal: 300,
  importeItbis: 54,
  total: 354,
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
  subtotal:        800,
  itbis:           144,
  total:           944,
  netoPagar:       944,
  retieneItbis:    false,
  retieneIsr:      false,
  montoRetencionItbis: 0,
  montoRetencionIsr:   0,
  detalles,
  empresaId:       EMPRESA,
});

function buildDeps(mockCompra: ReturnType<typeof makeCompra>) {
  return {
    compraRepo:  { findOne: jest.fn().mockResolvedValue(mockCompra), update: jest.fn().mockResolvedValue(undefined) },
    detalleRepo: { update: jest.fn().mockResolvedValue(undefined) },
    inventarioSvc: {
      registrarEntrada:    jest.fn().mockResolvedValue({ cantidadAnterior: 20 }),
      registrarDevolucion: jest.fn().mockResolvedValue(undefined),
    },
    valoracionSvc: { actualizarCostoPromedio: jest.fn().mockResolvedValue(undefined) },
    cxpSvc:      { crear: jest.fn().mockResolvedValue(undefined) },
    asientosSvc: { asientoCompraRecibida: jest.fn().mockResolvedValue(undefined) },
    tenantSvc: {
      getEmpresaId:      () => EMPRESA,
      getAlmacenId:      () => null,
      getSucursalId:     () => null,
      resolveSucursalId: jest.fn().mockResolvedValue(null),
    },
    realtimeSvc: { notify: jest.fn() },
    gastosImportacionSvc: {
      getCostosImportacionPorUnidad: jest.fn().mockResolvedValue(new Map()),
      aplicarGastosPendientes:       jest.fn().mockResolvedValue(undefined),
    },
    ds: { query: jest.fn().mockResolvedValue([]) },
  };
}

function buildService(d: ReturnType<typeof buildDeps>): ComprasService {
  return new ComprasService(
    d.compraRepo as any,
    d.detalleRepo as any,
    {} as any,
    {} as any,
    { registrarDesdeCompra: jest.fn() } as any,
    d.inventarioSvc as any,
    d.valoracionSvc as any,
    d.cxpSvc as any,
    d.asientosSvc as any,
    d.tenantSvc as any,
    d.realtimeSvc as any,
    d.gastosImportacionSvc as any,
    d.ds as any,
    { notificarAnulacionEnOrigen: jest.fn().mockResolvedValue(undefined) } as any,
  );
}

describe('ComprasService — líneas de servicio no mueven inventario ni AVCO', () => {
  it('cambiarEstado(RECIBIDA): compra mixta — solo la línea física llama registrarEntrada/AVCO', async () => {
    const fisico   = makeDetalle();
    const servicio = makeDetalleServicio();
    const compra   = makeCompra(CompraEstado.BORRADOR, [fisico, servicio]);
    const d        = buildDeps(compra);
    const service  = buildService(d);

    await service.cambiarEstado(COMPRA_ID, CompraEstado.RECIBIDA);

    expect(d.inventarioSvc.registrarEntrada).toHaveBeenCalledTimes(1);
    expect(d.inventarioSvc.registrarEntrada).toHaveBeenCalledWith(
      PROD_FISICO, 5, USUARIO, expect.any(String), 'COM-001', undefined,
    );
    expect(d.valoracionSvc.actualizarCostoPromedio).toHaveBeenCalledTimes(1);
    expect(d.valoracionSvc.actualizarCostoPromedio).toHaveBeenCalledWith(PROD_FISICO, 20, 5, 100);
  });

  it('recibir(): compra mixta — la línea de servicio no llama inventario/AVCO pero sí acumula cantidadRecibida', async () => {
    const fisico   = makeDetalle({ cantidadRecibida: 0 });
    const servicio = makeDetalleServicio({ id: 2, cantidadRecibida: 0 });
    const compra   = makeCompra(CompraEstado.ENVIADA, [fisico, servicio]);
    const d        = buildDeps(compra);
    const service  = buildService(d);

    await service.recibir(
      COMPRA_ID,
      { detalles: [
        { detalleId: 1, cantidadRecibida: 5 },
        { detalleId: 2, cantidadRecibida: 1 },
      ] },
      { id: USUARIO },
    );

    // Solo la línea física tocó inventario/AVCO
    expect(d.inventarioSvc.registrarEntrada).toHaveBeenCalledTimes(1);
    expect(d.inventarioSvc.registrarEntrada).toHaveBeenCalledWith(
      PROD_FISICO, 5, USUARIO, expect.any(String), 'COM-001', undefined,
    );
    expect(d.valoracionSvc.actualizarCostoPromedio).toHaveBeenCalledTimes(1);

    // Pero AMBAS líneas quedan con su cantidadRecibida acumulada
    expect(d.detalleRepo.update).toHaveBeenCalledWith(1, { cantidadRecibida: 5 });
    expect(d.detalleRepo.update).toHaveBeenCalledWith(2, { cantidadRecibida: 1 });
  });

  it('cambiarEstado(RECIBIDA): compra 100% de servicios — no llama inventario ni AVCO ninguna vez', async () => {
    const servicio = makeDetalleServicio();
    const compra   = makeCompra(CompraEstado.BORRADOR, [servicio]);
    const d        = buildDeps(compra);
    const service  = buildService(d);

    await service.cambiarEstado(COMPRA_ID, CompraEstado.RECIBIDA);

    expect(d.inventarioSvc.registrarEntrada).not.toHaveBeenCalled();
    expect(d.valoracionSvc.actualizarCostoPromedio).not.toHaveBeenCalled();
  });
});
