/**
 * Anular una Nota de Crédito revierte su propio asiento (si existe).
 *
 * anular() no tocaba contabilidad. Si la NC ya había sido aceptada por DGII
 * y tenía su propio asiento (ver ecf-efectos-nc.service.ts), quedaba vivo
 * tras la anulación. Ahora se revierte vía revertirAsiento(NOTA_CREDITO,
 * nc.id, ...) — que, si la NC nunca tuvo asiento (borrador, rechazada, o
 * nacida de una devolución), simplemente no encuentra nada y no rompe.
 */

import { NotasCreditoService } from './notas-credito.service';
import { EstadoNotaCredito } from './entities/nota-credito.entity';
import { TipoOrigenAsiento } from '../contabilidad/entities/asiento-contable.entity';

function makeService(nc: any) {
  const ncRepo = {
    findOne: jest.fn().mockResolvedValue(nc),
    update:  jest.fn((_id: number, data: any) => { Object.assign(nc, data); return Promise.resolve({}); }),
    manager: { query: jest.fn().mockResolvedValue([]) },
  };
  const tenantSvc      = { getEmpresaId: () => nc.empresaId };
  const asientosService = { revertirAsiento: jest.fn().mockResolvedValue({ id: 1 }) };

  const svc: any = Object.create(NotasCreditoService.prototype);
  svc.ncRepo          = ncRepo;
  svc.tenantSvc       = tenantSvc;
  svc.asientosService = asientosService;
  return { svc, ncRepo, asientosService };
}

describe('NotasCreditoService.anular revierte el asiento propio', () => {
  it('anular llama revertirAsiento(NOTA_CREDITO, nc.id, hoy, motivo con el número)', async () => {
    const nc = { id: 5, empresaId: 7, numero: 'NC-5', estado: EstadoNotaCredito.EMITIDA };
    const { svc, asientosService, ncRepo } = makeService(nc);

    await svc.anular(5);

    expect(ncRepo.update).toHaveBeenCalledWith(5, { estado: EstadoNotaCredito.ANULADA });
    expect(asientosService.revertirAsiento).toHaveBeenCalledWith(
      TipoOrigenAsiento.NOTA_CREDITO,
      5,
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      expect.stringContaining('NC-5'),
    );
  });

  it('una NC ya anulada no se puede volver a anular', async () => {
    const nc = { id: 6, empresaId: 7, numero: 'NC-6', estado: EstadoNotaCredito.ANULADA };
    const { svc, asientosService } = makeService(nc);

    await expect(svc.anular(6)).rejects.toThrow();
    expect(asientosService.revertirAsiento).not.toHaveBeenCalled();
  });
});
