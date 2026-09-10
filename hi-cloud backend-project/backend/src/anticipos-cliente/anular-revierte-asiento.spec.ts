/**
 * Anular un anticipo de cliente revierte su asiento.
 *
 * tipoOrigen COBRO se comparte entre CxC, recibos de cobro y anticipos, cada
 * uno con su propio espacio de id — revertirAsiento() necesita el
 * referenciaFolio ("ANT-<id>") para no revertir el asiento equivocado.
 */

import { AnticiposClienteService } from './anticipos-cliente.service';
import { EstadoAnticipo } from './entities/anticipo-cliente.entity';
import { TipoOrigenAsiento } from '../contabilidad/entities/asiento-contable.entity';

function makeService(anticipo: any) {
  const repo = {
    findOne: jest.fn().mockResolvedValue(anticipo),
    update:  jest.fn((_id: number, data: any) => { Object.assign(anticipo, data); return Promise.resolve({}); }),
  };
  const tenantSvc       = { getEmpresaId: () => anticipo.empresaId };
  const asientosService = { revertirAsiento: jest.fn().mockResolvedValue({ id: 1 }) };

  const svc: any = Object.create(AnticiposClienteService.prototype);
  svc.repo            = repo;
  svc.tenantSvc       = tenantSvc;
  svc.asientosService = asientosService;
  return { svc, repo, asientosService };
}

describe('AnticiposClienteService.anular revierte el asiento del anticipo', () => {
  it('anular llama revertirAsiento(COBRO, id, hoy, motivo, "ANT-<id>")', async () => {
    const anticipo = { id: 12, empresaId: 7, numero: 'ANT-000012', estado: EstadoAnticipo.ACTIVO };
    const { svc, asientosService, repo } = makeService(anticipo);

    await svc.anular(12);

    expect(repo.update).toHaveBeenCalledWith(12, { estado: EstadoAnticipo.ANULADO, isActive: false });
    expect(asientosService.revertirAsiento).toHaveBeenCalledWith(
      TipoOrigenAsiento.COBRO,
      12,
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      expect.stringContaining('ANT-000012'),
      'ANT-12', // referenciaFolio — desambigua contra CxC/recibos que comparten COBRO
    );
  });

  it('no se puede anular un anticipo ya aplicado por completo', async () => {
    const anticipo = { id: 13, empresaId: 7, numero: 'ANT-000013', estado: EstadoAnticipo.APLICADO };
    const { svc, asientosService } = makeService(anticipo);

    await expect(svc.anular(13)).rejects.toThrow();
    expect(asientosService.revertirAsiento).not.toHaveBeenCalled();
  });
});
