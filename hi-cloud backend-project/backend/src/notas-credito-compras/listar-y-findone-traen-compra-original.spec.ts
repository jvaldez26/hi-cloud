/**
 * NC de Compra — listar()/findOne() traen compraOriginal (2026-09-24).
 *
 * El usuario pidió que el "documento/NCF afectado" (Compra.numeroFacturaProveedor
 * — el mismo dato que getFormato606() ya usa como "NCF Modificado") se vea en
 * la tabla y en el modal, no solo se use puertas adentro al exportar el 606.
 * Sin esta relación, listar()/findOne() solo traían compraOriginalId (un
 * número sin contexto) — el frontend no tenía de dónde sacar el NCF real.
 */

import { NotasCreditoComprasService } from './notas-credito-compras.service';

describe('NotasCreditoComprasService — listar()/findOne() incluyen compraOriginal', () => {
  it('listar() hace leftJoinAndSelect de n.compraOriginal', async () => {
    const joins: string[] = [];
    const qb: any = {
      leftJoinAndSelect: (rel: string, alias: string) => { joins.push(`${rel} ${alias}`); return qb; },
      where:      () => qb,
      andWhere:   () => qb,
      orderBy:    () => qb,
      skip:       () => qb,
      take:       () => qb,
      getManyAndCount: async () => [[], 0],
    };
    const nccRepo = { createQueryBuilder: () => qb };
    const svc: any = Object.create(NotasCreditoComprasService.prototype);
    svc.nccRepo  = nccRepo;
    svc.tenantSvc = { getEmpresaId: () => 7 };

    await svc.listar({});

    expect(joins).toContain('n.proveedor p');
    expect(joins).toContain('n.compraOriginal co');
  });

  it('findOne() pide relations: [compraOriginal]', async () => {
    const nccRepo = { findOne: jest.fn().mockResolvedValue({ id: 1 }) };
    const svc: any = Object.create(NotasCreditoComprasService.prototype);
    svc.nccRepo  = nccRepo;
    svc.tenantSvc = { getEmpresaId: () => 7 };

    await svc.findOne(1);

    expect(nccRepo.findOne).toHaveBeenCalledWith({
      where: { id: 1, empresaId: 7, isActive: true },
      relations: ['compraOriginal'],
    });
  });
});
