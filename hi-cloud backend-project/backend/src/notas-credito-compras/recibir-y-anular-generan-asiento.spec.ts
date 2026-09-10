/**
 * Nota de Crédito de Compra: recibir genera su asiento; anular lo revierte.
 *
 * notas-credito-compras.service.ts no tocaba contabilidad en absoluto —
 * el mensaje de bloqueo de CxP (ver cxp.service.ts:anular) mandaba al
 * usuario aquí, pero la devolución a proveedor nunca quedaba en los libros.
 */

import { NotasCreditoComprasService } from './notas-credito-compras.service';
import { EstadoNCCompra } from './entities/nota-credito-compra.entity';
import { TipoOrigenAsiento } from '../contabilidad/entities/asiento-contable.entity';

function makeService(ncc: any) {
  const nccRepo = {
    findOne: jest.fn().mockResolvedValue(ncc),
    update:  jest.fn((_id: number, data: any) => { Object.assign(ncc, data); return Promise.resolve({}); }),
  };
  // update() dentro de la transacción es el que de verdad cambia el estado
  // en recibir() (em.getRepository(NotaCreditoCompra).update(...)).
  const nccRepoEm = {
    update: jest.fn((_id: number, data: any) => { Object.assign(ncc, data); return Promise.resolve({}); }),
  };
  const prodRepoEm = {
    findOne: jest.fn().mockResolvedValue(null), // sin producto vinculado — simplifica el reverso de stock
    update:  jest.fn().mockResolvedValue({}),
  };
  const em = {
    getRepository: (entity: any) =>
      entity?.name === 'Producto' ? prodRepoEm : nccRepoEm,
  };
  const dataSource = { transaction: jest.fn(async (cb: any) => cb(em)) };
  const tenantSvc = { getEmpresaId: () => ncc.empresaId };
  const asientosService = {
    asientoNotaCreditoCompra: jest.fn().mockResolvedValue(undefined),
    revertirAsiento:          jest.fn().mockResolvedValue({ id: 1 }),
  };

  const svc: any = Object.create(NotasCreditoComprasService.prototype);
  svc.nccRepo          = nccRepo;
  svc.dataSource        = dataSource;
  svc.tenantSvc         = tenantSvc;
  svc.asientosService   = asientosService;
  return { svc, nccRepoEm, asientosService };
}

describe('NotasCreditoComprasService — recibir genera asiento, anular lo revierte', () => {
  it('recibir llama asientoNotaCreditoCompra con los montos de la NCC', async () => {
    const ncc = {
      id: 9, empresaId: 7, numero: 'NCC-9', estado: EstadoNCCompra.BORRADOR,
      total: 236, subtotal: 200, iva: 36, usuarioId: 5, detalles: [],
    };
    const { svc, nccRepoEm, asientosService } = makeService(ncc);

    await svc.recibir(9);

    expect(nccRepoEm.update).toHaveBeenCalledWith(9, { estado: EstadoNCCompra.RECIBIDA });
    expect(asientosService.asientoNotaCreditoCompra).toHaveBeenCalledWith(9, 236, 200, 36, 'NCC-9', 5);
  });

  it('no se puede recibir una NCC que no está en BORRADOR', async () => {
    const ncc = { id: 10, empresaId: 7, numero: 'NCC-10', estado: EstadoNCCompra.RECIBIDA, detalles: [] };
    const { svc, asientosService } = makeService(ncc);

    await expect(svc.recibir(10)).rejects.toThrow();
    expect(asientosService.asientoNotaCreditoCompra).not.toHaveBeenCalled();
  });

  it('anular llama revertirAsiento(NOTA_CREDITO_COMPRA, ncc.id, hoy, motivo con el número)', async () => {
    const ncc = { id: 9, empresaId: 7, numero: 'NCC-9', estado: EstadoNCCompra.RECIBIDA };
    const { svc, asientosService } = makeService(ncc);

    await svc.anular(9);

    expect(asientosService.revertirAsiento).toHaveBeenCalledWith(
      TipoOrigenAsiento.NOTA_CREDITO_COMPRA,
      9,
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      expect.stringContaining('NCC-9'),
    );
  });

  it('una NCC ya anulada no se puede volver a anular', async () => {
    const ncc = { id: 11, empresaId: 7, numero: 'NCC-11', estado: EstadoNCCompra.ANULADA };
    const { svc, asientosService } = makeService(ncc);

    await expect(svc.anular(11)).rejects.toThrow();
    expect(asientosService.revertirAsiento).not.toHaveBeenCalled();
  });
});
