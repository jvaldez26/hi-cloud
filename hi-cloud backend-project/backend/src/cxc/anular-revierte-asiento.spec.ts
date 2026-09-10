/**
 * Anular una CxC revierte el asiento de venta de su factura.
 */

import { CxCService } from './cxc.service';
import { EstadoCuenta } from '../common/enums/estado-cuenta.enum';
import { TipoOrigenAsiento } from '../contabilidad/entities/asiento-contable.entity';

function makeService(cuenta: any) {
  const cxcRepository = {
    findOne: jest.fn().mockResolvedValue(cuenta),
    update:  jest.fn((_id: number, data: any) => { Object.assign(cuenta, data); return Promise.resolve({}); }),
  };
  const tenantService   = { getEmpresaId: () => cuenta.empresaId };
  const asientosService = { revertirAsiento: jest.fn().mockResolvedValue({ id: 1 }) };

  const svc: any = Object.create(CxCService.prototype);
  svc.logger          = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
  svc.cxcRepository   = cxcRepository;
  svc.tenantService   = tenantService;
  svc.asientosService = asientosService;
  return { svc, cxcRepository, asientosService };
}

describe('CxCService.anular revierte el asiento de la factura', () => {
  it('anular llama revertirAsiento(FACTURA, cuenta.facturaId, hoy, motivo)', async () => {
    const cuenta = { id: 47, empresaId: 7, facturaId: 200, estado: EstadoCuenta.PENDIENTE };
    const { svc, asientosService, cxcRepository } = makeService(cuenta);

    await svc.anular(47);

    expect(cxcRepository.update).toHaveBeenCalledWith(47, { estado: EstadoCuenta.ANULADA });
    expect(asientosService.revertirAsiento).toHaveBeenCalledWith(
      TipoOrigenAsiento.FACTURA, 200, expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), expect.stringContaining('47'),
    );
  });

  it('no se puede anular una CxC ya PAGADA', async () => {
    const cuenta = { id: 48, empresaId: 7, facturaId: 201, estado: EstadoCuenta.PAGADA };
    const { svc, asientosService } = makeService(cuenta);

    await expect(svc.anular(48)).rejects.toThrow();
    expect(asientosService.revertirAsiento).not.toHaveBeenCalled();
  });

  describe('anularPorFacturaId', () => {
    it('anula la CxC pendiente y revierte el asiento de la factura', async () => {
      const cuenta = { id: 50, empresaId: 7, facturaId: 300, estado: EstadoCuenta.PENDIENTE };
      const { svc, asientosService, cxcRepository } = makeService(cuenta);

      await svc.anularPorFacturaId(300);

      expect(cxcRepository.update).toHaveBeenCalledWith(50, { estado: EstadoCuenta.ANULADA });
      expect(asientosService.revertirAsiento).toHaveBeenCalledWith(
        TipoOrigenAsiento.FACTURA, 300, expect.any(String), expect.any(String),
      );
    });

    it('sin CxC vinculada no llama revertirAsiento (factura de contado)', async () => {
      const { svc, asientosService, cxcRepository } = makeService(null);
      cxcRepository.findOne.mockResolvedValueOnce(null);

      await svc.anularPorFacturaId(999);

      expect(asientosService.revertirAsiento).not.toHaveBeenCalled();
    });

    it('CxC ya PAGADA: se omite sin revertir el asiento', async () => {
      const cuenta = { id: 51, empresaId: 7, facturaId: 301, estado: EstadoCuenta.PAGADA };
      const { svc, asientosService } = makeService(cuenta);

      await svc.anularPorFacturaId(301);

      expect(asientosService.revertirAsiento).not.toHaveBeenCalled();
    });
  });
});
