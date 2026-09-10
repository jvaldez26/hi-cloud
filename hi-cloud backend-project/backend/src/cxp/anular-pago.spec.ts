/**
 * Bloque 2 — CxPService.anularPago(), homólogo de CxCService.anularPago.
 *
 * asientoPago ahora etiqueta el asiento por el id del PAGO, no por el de la
 * CxP — revertirAsiento() lo encuentra sin ambigüedad aunque la cuenta tenga
 * otros abonos activos. No existe un concepto de "recibo de pago a
 * proveedor" en este módulo, así que no hace falta el guard que sí tiene
 * CxCService.anularPago.
 */

import { CxPService } from './cxp.service';
import { EstadoCuenta } from '../common/enums/estado-cuenta.enum';
import { TipoOrigenAsiento } from '../contabilidad/entities/asiento-contable.entity';

function makeService(pago: any, cuenta: any) {
  const pagoRepository = { findOne: jest.fn().mockResolvedValue(pago) };
  const cxpRepository  = { findOne: jest.fn().mockResolvedValue(cuenta) };
  const tenantService  = { getEmpresaId: () => cuenta?.empresaId ?? 7 };
  const asientosService = { revertirAsiento: jest.fn().mockResolvedValue({ id: 1 }) };
  const compraRepository = {
    manager: {
      transaction: jest.fn(async (cb: any) => cb({
        getRepository: () => ({ update: jest.fn().mockResolvedValue({}) }),
      })),
    },
  };

  const svc: any = Object.create(CxPService.prototype);
  svc.logger           = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
  svc.pagoRepository    = pagoRepository;
  svc.cxpRepository     = cxpRepository;
  svc.compraRepository  = compraRepository;
  svc.tenantService     = tenantService;
  svc.asientosService   = asientosService;
  return { svc, compraRepository, asientosService };
}

describe('CxPService.anularPago', () => {
  it('valida que el pago exista', async () => {
    const { svc } = makeService(null, null);
    await expect(svc.anularPago(999)).rejects.toThrow(/no encontrado/i);
  });

  it('anula el pago, revierte saldos y revierte su propio asiento', async () => {
    const pago   = { id: 700, cuentaPorPagarId: 30, monto: 300, isActive: true };
    const cuenta = { id: 30, empresaId: 7, montoPagado: 300, montoOriginal: 1000, compraId: 20 };
    const { svc, compraRepository, asientosService } = makeService(pago, cuenta);

    const r = await svc.anularPago(700);

    expect(r.ok).toBe(true);
    expect(compraRepository.manager.transaction).toHaveBeenCalled();
    expect(asientosService.revertirAsiento).toHaveBeenCalledWith(
      TipoOrigenAsiento.PAGO,
      700,                                        // referenciaId = id del PAGO, no el de la CxP
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      expect.stringContaining('700'),
      'PAGOCXP-700',
    );
  });
});
