/**
 * Anular una CxP revierte el asiento de la compra que la originó.
 */

import { CxPService } from './cxp.service';
import { EstadoCuenta } from '../common/enums/estado-cuenta.enum';
import { TipoOrigenAsiento } from '../contabilidad/entities/asiento-contable.entity';

function makeService(cuenta: any) {
  const cxpRepository = {
    findOne: jest.fn().mockResolvedValue(cuenta),
    update:  jest.fn((_id: number, data: any) => { Object.assign(cuenta, data); return Promise.resolve({}); }),
  };
  const tenantService   = { getEmpresaId: () => cuenta.empresaId };
  const asientosService = { revertirAsiento: jest.fn().mockResolvedValue({ id: 1 }) };

  const svc: any = Object.create(CxPService.prototype);
  svc.logger          = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
  svc.cxpRepository   = cxpRepository;
  svc.tenantService   = tenantService;
  svc.asientosService = asientosService;
  return { svc, cxpRepository, asientosService };
}

describe('CxPService.anular revierte el asiento de la compra', () => {
  it('anular llama revertirAsiento(COMPRA, cuenta.compraId, hoy, motivo)', async () => {
    const cuenta = { id: 20, empresaId: 7, compraId: 500, estado: EstadoCuenta.PENDIENTE };
    const { svc, asientosService, cxpRepository } = makeService(cuenta);

    await svc.anular(20);

    expect(cxpRepository.update).toHaveBeenCalledWith(20, { estado: EstadoCuenta.ANULADA });
    expect(asientosService.revertirAsiento).toHaveBeenCalledWith(
      TipoOrigenAsiento.COMPRA, 500, expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), expect.stringContaining('20'),
    );
  });

  it('no se puede anular una CxP ya PAGADA', async () => {
    const cuenta = { id: 21, empresaId: 7, compraId: 501, estado: EstadoCuenta.PAGADA };
    const { svc, asientosService } = makeService(cuenta);

    await expect(svc.anular(21)).rejects.toThrow();
    expect(asientosService.revertirAsiento).not.toHaveBeenCalled();
  });
});
