/**
 * Anular una CxP revierte el asiento de la compra que la originó — con las
 * mismas dos guardas que CxCService.anular (ver esos comentarios): abonos
 * aplicados rompen el balance si se revierte; e-CF (E41) confirmado por
 * DGII desalinea el 607 si se revierte.
 */

import { CxPService } from './cxp.service';
import { EstadoCuenta } from '../common/enums/estado-cuenta.enum';
import { TipoOrigenAsiento } from '../contabilidad/entities/asiento-contable.entity';

function makeService(cuenta: any, opts: { ecfRow?: { estadoDGII: string } } = {}) {
  const cxpRepository = {
    findOne: jest.fn().mockResolvedValue(cuenta),
    update:  jest.fn((_id: number, data: any) => { Object.assign(cuenta, data); return Promise.resolve({}); }),
  };
  const tenantService   = { getEmpresaId: () => cuenta.empresaId };
  const asientosService = { revertirAsiento: jest.fn().mockResolvedValue({ id: 1 }) };
  const compraRepository = { manager: { query: jest.fn().mockResolvedValue(opts.ecfRow ? [opts.ecfRow] : []) } };

  const svc: any = Object.create(CxPService.prototype);
  svc.logger           = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
  svc.cxpRepository    = cxpRepository;
  svc.tenantService    = tenantService;
  svc.asientosService  = asientosService;
  svc.compraRepository = compraRepository;
  return { svc, cxpRepository, asientosService, compraRepository };
}

describe('CxPService.anular', () => {
  it('CxP PENDIENTE sin abonos: funciona igual que hoy — revierte el asiento', async () => {
    const cuenta = { id: 20, empresaId: 7, compraId: 500, estado: EstadoCuenta.PENDIENTE, montoPagado: 0 };
    const { svc, asientosService, cxpRepository } = makeService(cuenta);

    await svc.anular(20);

    expect(cxpRepository.update).toHaveBeenCalledWith(20, { estado: EstadoCuenta.ANULADA });
    expect(asientosService.revertirAsiento).toHaveBeenCalledWith(
      TipoOrigenAsiento.COMPRA, 500, expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), expect.stringContaining('20'),
    );
  });

  it('CxP con un abono: rechaza con mensaje claro y NO revierte nada', async () => {
    const cuenta = { id: 21, empresaId: 7, compraId: 501, estado: EstadoCuenta.PAGADA_PARCIAL, montoPagado: 300 };
    const { svc, asientosService, cxpRepository } = makeService(cuenta);

    await expect(svc.anular(21)).rejects.toThrow(/300.*pagad|pagad.*300/i);
    expect(cxpRepository.update).not.toHaveBeenCalled();
    expect(asientosService.revertirAsiento).not.toHaveBeenCalled();
  });

  it('CxP de compra con e-CF (E41) aceptado: rechaza y menciona nota de crédito de compra', async () => {
    const cuenta = { id: 22, empresaId: 7, compraId: 502, estado: EstadoCuenta.PENDIENTE, montoPagado: 0 };
    const { svc, asientosService } = makeService(cuenta, { ecfRow: { estadoDGII: 'aceptado' } });

    await expect(svc.anular(22)).rejects.toThrow(/nota de crédito/i);
    expect(asientosService.revertirAsiento).not.toHaveBeenCalled();
  });

  it('no se puede anular una CxP ya PAGADA', async () => {
    const cuenta = { id: 23, empresaId: 7, compraId: 503, estado: EstadoCuenta.PAGADA, montoPagado: 1000 };
    const { svc, asientosService } = makeService(cuenta);

    await expect(svc.anular(23)).rejects.toThrow();
    expect(asientosService.revertirAsiento).not.toHaveBeenCalled();
  });
});
