/**
 * Bloque 1 — contención inmediata: anularPago() dejaba montoPagado en 0 sin
 * revertir el asiento de cobro (Debe Bancos/Haber Clientes) — Bancos quedaba
 * con dinero sin contrapartida, y la cuenta pasaba el filtro de abonos de
 * anular() como si nunca hubiera tenido pagos.
 *
 * Bloqueado hasta reactivarlo con su reversa correcta (bloque 2, granularidad
 * de referenciaId en asientoCobro).
 */

import { CxCService } from './cxc.service';

function makeService(pago: any, cxc: any) {
  const pagoRepository = { findOne: jest.fn().mockResolvedValue(pago) };
  const cxcRepository  = { findOne: jest.fn().mockResolvedValue(cxc), update: jest.fn() };
  const tenantService  = { getEmpresaId: () => cxc?.empresaId ?? 7 };
  const dataSource     = { transaction: jest.fn() };

  const svc: any = Object.create(CxCService.prototype);
  svc.logger          = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
  svc.pagoRepository   = pagoRepository;
  svc.cxcRepository    = cxcRepository;
  svc.tenantService    = tenantService;
  svc.dataSource       = dataSource;
  return { svc, cxcRepository, dataSource };
}

describe('CxCService.anularPago — bloqueado (Bloque 1)', () => {
  it('rechaza con mensaje claro y no toca saldos ni transacción', async () => {
    const pago = { id: 900, cuentaPorCobrarId: 47, monto: 400, isActive: true };
    const cxc  = { id: 47, empresaId: 7, montoPagado: 400, montoOriginal: 1180, facturaId: 10 };
    const { svc, cxcRepository, dataSource } = makeService(pago, cxc);

    await expect(svc.anularPago(900)).rejects.toThrow(/recibo de cobro/i);

    expect(cxcRepository.update).not.toHaveBeenCalled();
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('sigue validando que el pago exista antes de bloquear', async () => {
    const { svc } = makeService(null, null);

    await expect(svc.anularPago(999)).rejects.toThrow(/no encontrado/i);
  });
});
