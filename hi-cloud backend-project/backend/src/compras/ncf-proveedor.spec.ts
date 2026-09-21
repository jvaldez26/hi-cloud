import { ComprasService } from './compras.service';
import { CompraEstado } from './entities/compra.entity';

/**
 * NCF del proveedor post-borrador (2026-09-21). `update()` reemplaza cabecera
 * y líneas enteras y por eso está cerrado a borrador; el NCF casi nunca llega
 * junto con la recepción (la factura física del proveedor suele llegar
 * después) y hasta ahora no había ninguna forma de registrarlo una vez
 * recibida la orden — el banner de CompraDetailPage prometía "edítala" pero
 * no existía ninguna ruta que lo permitiera.
 *
 * `actualizarNcfProveedor()` es la ruta acotada: solo numeroFacturaProveedor
 * + tipoBienes/formaPago (606), nunca líneas ni montos, por eso puede
 * habilitarse fuera de borrador sin arriesgar inventario/AVCO/asientos ya
 * contabilizados.
 */

const EMPRESA   = 1;
const COMPRA_ID = 99;

const makeCompra = (estado: CompraEstado, extra: Record<string, unknown> = {}) => ({
  id: COMPRA_ID, folio: 'OC-001', estado, empresaId: EMPRESA,
  numeroFacturaProveedor: null, tipoBienes: '09', formaPago: '04',
  detalles: [], proveedor: {}, usuario: {},
  ...extra,
});

function buildService(mockCompra: ReturnType<typeof makeCompra>) {
  const compraRepo = {
    findOne: jest.fn().mockResolvedValue(mockCompra),
    update:  jest.fn().mockResolvedValue(undefined),
  };
  const tenantSvc   = { getEmpresaId: () => EMPRESA };
  const realtimeSvc = { notify: jest.fn() };

  const service = new ComprasService(
    compraRepo as any,
    {} as any,                    // detalleRepo
    {} as any,                    // proveedoresService
    {} as any,                    // productosService
    {} as any,                    // productoProveedorSvc
    {} as any,                    // inventarioSvc
    {} as any,                    // valoracionSvc
    {} as any,                    // cxpSvc
    {} as any,                    // asientosSvc
    tenantSvc as any,
    realtimeSvc as any,
    {} as any,                    // gastosImportacionSvc
    {} as any,                    // ds
  );

  return { service, compraRepo, realtimeSvc };
}

describe('ComprasService.actualizarNcfProveedor', () => {
  it.each([CompraEstado.RECIBIDA, CompraEstado.RECIBIDA_PARCIAL, CompraEstado.PAGADA])(
    'permite registrar el NCF en estado %s',
    async (estado) => {
      const { service, compraRepo, realtimeSvc } = buildService(makeCompra(estado));

      await service.actualizarNcfProveedor(COMPRA_ID, {
        numeroFacturaProveedor: 'B0100000123',
        tipoBienes: '02',
        formaPago: '01',
      });

      expect(compraRepo.update).toHaveBeenCalledWith(
        { id: COMPRA_ID, empresaId: EMPRESA },
        { numeroFacturaProveedor: 'B0100000123', tipoBienes: '02', formaPago: '01' },
      );
      expect(realtimeSvc.notify).toHaveBeenCalledWith(EMPRESA, 'compra', 'updated', COMPRA_ID);
    },
  );

  it.each([CompraEstado.BORRADOR, CompraEstado.ENVIADA, CompraEstado.CANCELADA])(
    'rechaza el estado %s — el NCF solo se registra tras recibir la orden',
    async (estado) => {
      const { service, compraRepo } = buildService(makeCompra(estado));

      await expect(
        service.actualizarNcfProveedor(COMPRA_ID, { numeroFacturaProveedor: 'B0100000123' }),
      ).rejects.toThrow(/recibidas o pagadas/);
      expect(compraRepo.update).not.toHaveBeenCalled();
    },
  );

  it('solo actualiza los campos enviados — no pisa tipoBienes/formaPago con undefined', async () => {
    const { service, compraRepo } = buildService(
      makeCompra(CompraEstado.RECIBIDA, { tipoBienes: '09', formaPago: '04' }),
    );

    await service.actualizarNcfProveedor(COMPRA_ID, { numeroFacturaProveedor: 'B0100000123' });

    expect(compraRepo.update).toHaveBeenCalledWith(
      { id: COMPRA_ID, empresaId: EMPRESA },
      { numeroFacturaProveedor: 'B0100000123' },
    );
  });
});
