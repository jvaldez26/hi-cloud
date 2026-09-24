/**
 * Nota de Crédito de Compra: recibir genera su asiento (con la cuenta
 * correcta según el TIPO de efecto); anular lo revierte.
 *
 * notas-credito-compras.service.ts no tocaba contabilidad en absoluto —
 * el mensaje de bloqueo de CxP (ver cxp.service.ts:anular) mandaba al
 * usuario aquí, pero la devolución a proveedor nunca quedaba en los libros.
 *
 * 2026-09-24: se agregó `tipo` (devolucion_inventario / ajuste_sin_devolucion
 * / no_recibida) — decide si recibir() toca stock físico y qué cuenta se
 * acredita en el asiento.
 */

import { NotasCreditoComprasService } from './notas-credito-compras.service';
import { EstadoNCCompra, TipoNCCompra } from './entities/nota-credito-compra.entity';
import { TipoOrigenAsiento } from '../contabilidad/entities/asiento-contable.entity';

function makeService(ncc: any, opts: { compraOriginal?: any } = {}) {
  const nccRepo = {
    findOne: jest.fn().mockResolvedValue(ncc),
    update:  jest.fn((_id: number, data: any) => { Object.assign(ncc, data); return Promise.resolve({}); }),
  };
  // update() dentro de la transacción es el que de verdad cambia el estado
  // en recibir() (em.getRepository(NotaCreditoCompra).update(...)) — solo
  // se usa cuando el tipo SÍ mueve stock (devolucion_inventario).
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
  const compraRepo = {
    findOne: jest.fn().mockResolvedValue(opts.compraOriginal ?? null),
  };

  const svc: any = Object.create(NotasCreditoComprasService.prototype);
  svc.nccRepo          = nccRepo;
  svc.dataSource        = dataSource;
  svc.tenantSvc         = tenantSvc;
  svc.asientosService   = asientosService;
  svc.compraRepo        = compraRepo;
  return { svc, nccRepo, nccRepoEm, asientosService, compraRepo };
}

describe('NotasCreditoComprasService — recibir genera asiento, anular lo revierte', () => {
  it('devolucion_inventario: mueve stock (transacción) y acredita Inventario (sin opciones)', async () => {
    const ncc = {
      id: 9, empresaId: 7, numero: 'NCC-9', estado: EstadoNCCompra.BORRADOR, tipo: TipoNCCompra.DEVOLUCION_INVENTARIO,
      total: 236, subtotal: 200, iva: 36, fecha: '2026-09-19', usuarioId: 5, detalles: [],
    };
    const { svc, nccRepoEm, asientosService, compraRepo } = makeService(ncc);

    await svc.recibir(9);

    expect(nccRepoEm.update).toHaveBeenCalledWith(9, { estado: EstadoNCCompra.RECIBIDA });
    expect(compraRepo.findOne).not.toHaveBeenCalled(); // sin compraOriginalId, no hay nada que resolver
    expect(asientosService.asientoNotaCreditoCompra).toHaveBeenCalledWith(
      9, 236, 200, 36, 'NCC-9', '2026-09-19', 5,
      { cuentaDestinoOriginal: undefined, sinInventario: false },
    );
  });

  it('devolucion_inventario con compraOriginalId: pasa el cuentaDestino de la compra original', async () => {
    const ncc = {
      id: 9, empresaId: 7, numero: 'NCC-9', estado: EstadoNCCompra.BORRADOR, tipo: TipoNCCompra.DEVOLUCION_INVENTARIO,
      compraOriginalId: 55, total: 236, subtotal: 200, iva: 36, fecha: '2026-09-19', usuarioId: 5, detalles: [],
    };
    const { svc, asientosService, compraRepo } = makeService(ncc, { compraOriginal: { id: 55, cuentaDestino: '6.1.9.09' } });

    await svc.recibir(9);

    expect(compraRepo.findOne).toHaveBeenCalledWith({ where: { id: 55 } });
    expect(asientosService.asientoNotaCreditoCompra).toHaveBeenCalledWith(
      9, 236, 200, 36, 'NCC-9', '2026-09-19', 5,
      { cuentaDestinoOriginal: '6.1.9.09', sinInventario: false },
    );
  });

  it('ajuste_sin_devolucion: NO toca stock (sin transacción) y pide sinInventario=true', async () => {
    const ncc = {
      id: 12, empresaId: 7, numero: 'NCC-12', estado: EstadoNCCompra.BORRADOR, tipo: TipoNCCompra.AJUSTE_SIN_DEVOLUCION,
      compraOriginalId: 55, total: 118, subtotal: 100, iva: 18, fecha: '2026-09-19', usuarioId: 5, detalles: [],
    };
    const { svc, nccRepo, asientosService, compraRepo } = makeService(ncc, { compraOriginal: { id: 55, cuentaDestino: '6.1.9.09' } });

    await svc.recibir(12);

    // Sin dataSource.transaction — la actualización de estado va directa por nccRepo, no por la transacción de stock.
    expect(nccRepo.update).toHaveBeenCalledWith(12, { estado: EstadoNCCompra.RECIBIDA });
    // ajuste_sin_devolucion nunca resuelve cuentaDestinoOriginal — no reversa esa cuenta.
    expect(compraRepo.findOne).not.toHaveBeenCalled();
    expect(asientosService.asientoNotaCreditoCompra).toHaveBeenCalledWith(
      12, 118, 100, 18, 'NCC-12', '2026-09-19', 5,
      { cuentaDestinoOriginal: undefined, sinInventario: true },
    );
  });

  it('no_recibida: NO toca stock pero SÍ resuelve cuentaDestino de la compra original (mismo compromiso a corregir)', async () => {
    const ncc = {
      id: 13, empresaId: 7, numero: 'NCC-13', estado: EstadoNCCompra.BORRADOR, tipo: TipoNCCompra.NO_RECIBIDA,
      compraOriginalId: 55, total: 118, subtotal: 100, iva: 18, fecha: '2026-09-19', usuarioId: 5, detalles: [],
    };
    const { svc, nccRepo, asientosService, compraRepo } = makeService(ncc, { compraOriginal: { id: 55, cuentaDestino: null } });

    await svc.recibir(13);

    expect(nccRepo.update).toHaveBeenCalledWith(13, { estado: EstadoNCCompra.RECIBIDA });
    expect(compraRepo.findOne).toHaveBeenCalledWith({ where: { id: 55 } });
    // cuentaDestino null en la compra → undefined (el motor cae a su default Inventario).
    expect(asientosService.asientoNotaCreditoCompra).toHaveBeenCalledWith(
      13, 118, 100, 18, 'NCC-13', '2026-09-19', 5,
      { cuentaDestinoOriginal: undefined, sinInventario: false },
    );
  });

  it('no se puede recibir una NCC que no está en BORRADOR', async () => {
    const ncc = { id: 10, empresaId: 7, numero: 'NCC-10', estado: EstadoNCCompra.RECIBIDA, tipo: TipoNCCompra.DEVOLUCION_INVENTARIO, detalles: [] };
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
