import { ComprasService } from './compras.service';
import { CompraEstado } from './entities/compra.entity';
import { CompraDetalle } from './entities/compra-detalle.entity';

/**
 * Bug real (auditoría HiCloud Xlink, 2026-10-03, Fase 1a): al aplicar una
 * factura de proveedor recibida por Xlink sobre una OC propia que sigue en
 * ENVIADA, el chequeo de cuadre (total de la factura vs. total recalculado)
 * vivía en el CALLER (xlink-recibir.service.ts), DESPUÉS de que esta misma
 * función ya había actualizado y COMMITEADO cabecera+detalles. El mensaje de
 * error decía "no se aplicó ningún cambio en firme" mientras la OC ya había
 * quedado modificada — justo lo contrario de lo que decía.
 *
 * Fix: el chequeo corre AQUÍ, con el total recalculado ANTES de abrir la
 * transacción — si no cuadra, se lanza sin tocar la BD en absoluto.
 */
const PROD_ID   = 10;
const EMPRESA   = 1;
const COMPRA_ID = 99;

const detalleOriginal = {
  id: 500, compraId: COMPRA_ID, productoId: PROD_ID, descripcion: 'Original',
  cantidad: 1, precioUnitario: 999, porcentajeItbis: 18,
};

const makeCompra = (extra: Record<string, unknown> = {}) => ({
  id: COMPRA_ID, folio: 'COM-106', estado: CompraEstado.ENVIADA, empresaId: EMPRESA,
  proveedorId: 5, numeroFacturaProveedor: null, subtotal: 999, itbis: 179.82, total: 1178.82,
  detalles: [detalleOriginal], proveedor: {}, usuario: {},
  ...extra,
});

function buildService(mockCompra: ReturnType<typeof makeCompra>) {
  const compraRepo = {
    findOne: jest.fn().mockResolvedValue(mockCompra),
    update:  jest.fn().mockResolvedValue(undefined),
  };
  const detalleRepoEm = {
    delete: jest.fn().mockResolvedValue(undefined),
    save:   jest.fn().mockResolvedValue(undefined),
    create: jest.fn((rows: any[]) => rows),
  };
  const manager = {
    getRepository: jest.fn((entity: any) => entity === CompraDetalle ? detalleRepoEm : compraRepo),
    query: jest.fn().mockResolvedValue([]), // assertNcfNoDuplicado no encuentra nada
  };
  const ds = { transaction: jest.fn(async (cb: any) => cb(manager)) };

  const productosService = {
    findByIds: jest.fn().mockResolvedValue(new Map([[PROD_ID, { id: PROD_ID, nombre: 'Producto Test' }]])),
  };
  const proveedoresService = { findOne: jest.fn().mockResolvedValue({ id: 5, nombre: 'Proveedor Test' }) };
  const realtimeSvc = { notify: jest.fn() };

  const service = new ComprasService(
    compraRepo as any,
    {} as any,                    // detalleRepo (inyectado, no se usa fuera de la transacción)
    proveedoresService as any,
    productosService as any,
    {} as any,                    // productoProveedorSvc
    {} as any,                    // inventarioSvc
    {} as any,                    // valoracionSvc
    {} as any,                    // cxpSvc
    {} as any,                    // asientosSvc
    { getEmpresaId: () => EMPRESA } as any,
    realtimeSvc as any,
    { getCostosImportacionPorUnidad: jest.fn().mockResolvedValue(new Map()) } as any, // gastosImportacionSvc
    ds as any,
    { notificarAnulacionEnOrigen: jest.fn().mockResolvedValue(undefined) } as any,
  );

  return { service, compraRepo, detalleRepoEm, ds, realtimeSvc };
}

const dtoFactura = {
  proveedorId: 5, fecha: '2026-09-20',
  detalles: [{ productoId: PROD_ID, cantidad: 1, precioUnitario: 1000, porcentajeItbis: 18 }],
} as any;
// 1 × 1000 = 1000 subtotal, ITBIS 18% = 180, total 1180.

describe('ComprasService.aplicarFacturaProveedorSobreEnviada — cuadre ANTES de escribir', () => {
  it('total que coincide: aplica cabecera + detalles dentro de la transacción', async () => {
    const { service, compraRepo, detalleRepoEm, ds } = buildService(makeCompra());

    await service.aplicarFacturaProveedorSobreEnviada(COMPRA_ID, dtoFactura, 1180);

    expect(ds.transaction).toHaveBeenCalledTimes(1);
    expect(compraRepo.update).toHaveBeenCalledWith(
      { id: COMPRA_ID, empresaId: EMPRESA },
      expect.objectContaining({ total: 1180, subtotal: 1000, itbis: 180 }),
    );
    expect(detalleRepoEm.delete).toHaveBeenCalledWith({ compraId: COMPRA_ID });
    expect(detalleRepoEm.save).toHaveBeenCalled();
  });

  it('total que NO coincide: lanza SIN abrir la transacción — la OC no cambia en nada', async () => {
    const { service, compraRepo, detalleRepoEm, ds } = buildService(makeCompra());

    await expect(
      service.aplicarFacturaProveedorSobreEnviada(COMPRA_ID, dtoFactura, 999.99),
    ).rejects.toThrow(/no se aplicó ningún cambio/);

    // Ni la transacción se abrió — cero escritura, en ningún campo ni detalle.
    expect(ds.transaction).not.toHaveBeenCalled();
    expect(compraRepo.update).not.toHaveBeenCalled();
    expect(detalleRepoEm.delete).not.toHaveBeenCalled();
    expect(detalleRepoEm.save).not.toHaveBeenCalled();
  });

  it('sin totalEsperado (3er argumento omitido): no valida cuadre — comportamiento de create()/update() normales, sin romper callers que no lo pasan', async () => {
    const { service, ds } = buildService(makeCompra());

    await expect(
      service.aplicarFacturaProveedorSobreEnviada(COMPRA_ID, dtoFactura),
    ).resolves.toBeDefined();
    expect(ds.transaction).toHaveBeenCalledTimes(1);
  });

  it('estado distinto de ENVIADA: rechaza antes de calcular nada', async () => {
    const { service, ds } = buildService(makeCompra({ estado: CompraEstado.RECIBIDA }));

    await expect(
      service.aplicarFacturaProveedorSobreEnviada(COMPRA_ID, dtoFactura, 1180),
    ).rejects.toThrow(/estado "enviada"/);
    expect(ds.transaction).not.toHaveBeenCalled();
  });
});
