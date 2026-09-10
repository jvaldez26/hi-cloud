/**
 * Bloque 2 — reactivación de anularPago() con su reversa correcta.
 *
 * asientoCobro ahora etiqueta el asiento por el id del PAGO, no por el de la
 * CxC (ver asientos-automaticos.service.ts) — eso permite a revertirAsiento()
 * encontrar sin ambigüedad el asiento de un pago específico aunque la cuenta
 * tenga otros abonos activos.
 *
 * Sigue bloqueado el caso que causaría doble reversa: un pago vinculado a un
 * recibo de cobro debe revertirse SOLO desde recibos-cobro.service.ts —
 * revertirlo también desde aquí infla Clientes en vez de corregirlo.
 */

import { CxCService } from './cxc.service';
import { EstadoCuenta } from '../common/enums/estado-cuenta.enum';
import { TipoOrigenAsiento } from '../contabilidad/entities/asiento-contable.entity';

function makeService(pago: any, cxc: any) {
  const pagoRepository = { findOne: jest.fn().mockResolvedValue(pago) };
  const cxcRepository  = { findOne: jest.fn().mockResolvedValue(cxc), update: jest.fn() };
  const tenantService  = { getEmpresaId: () => cxc?.empresaId ?? 7 };
  const asientosService = { revertirAsiento: jest.fn().mockResolvedValue({ id: 1 }) };
  const dataSource = {
    transaction: jest.fn(async (cb: any) => cb({
      getRepository: () => ({ update: jest.fn().mockResolvedValue({}) }),
    })),
  };

  const svc: any = Object.create(CxCService.prototype);
  svc.logger           = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
  svc.pagoRepository    = pagoRepository;
  svc.cxcRepository     = cxcRepository;
  svc.tenantService     = tenantService;
  svc.asientosService   = asientosService;
  svc.dataSource        = dataSource;
  return { svc, cxcRepository, asientosService, dataSource };
}

describe('CxCService.anularPago', () => {
  it('sigue validando que el pago exista', async () => {
    const { svc } = makeService(null, null);
    await expect(svc.anularPago(999)).rejects.toThrow(/no encontrado/i);
  });

  it('pago vinculado a un recibo de cobro: rechaza y apunta al recibo', async () => {
    const pago = { id: 900, cuentaPorCobrarId: 47, monto: 400, isActive: true, notas: 'Recibo REC-00012' };
    const cxc  = { id: 47, empresaId: 7, montoPagado: 400, montoOriginal: 1180, facturaId: 10 };
    const { svc, dataSource, asientosService } = makeService(pago, cxc);

    await expect(svc.anularPago(900)).rejects.toThrow(/recibo/i);

    expect(dataSource.transaction).not.toHaveBeenCalled();
    expect(asientosService.revertirAsiento).not.toHaveBeenCalled();
  });

  it('pago SIN recibo: se anula, revierte saldos y revierte su propio asiento', async () => {
    const pago = { id: 901, cuentaPorCobrarId: 48, monto: 400, isActive: true, notas: null };
    const cxc  = { id: 48, empresaId: 7, montoPagado: 400, montoOriginal: 1180, facturaId: 11 };
    const { svc, dataSource, asientosService } = makeService(pago, cxc);

    const r = await svc.anularPago(901);

    expect(r.ok).toBe(true);
    expect(dataSource.transaction).toHaveBeenCalled();
    expect(asientosService.revertirAsiento).toHaveBeenCalledWith(
      TipoOrigenAsiento.COBRO,
      901,                                        // referenciaId = id del PAGO, no el de la CxC
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      expect.stringContaining('901'),
      'PAGO-901',
    );
  });

  it('un pago con "referencia" pero notas que NO empiezan con "Recibo" no se confunde — se revierte', async () => {
    const pago = { id: 902, cuentaPorCobrarId: 49, monto: 200, isActive: true, notas: 'Pago directo sin recibo' };
    const cxc  = { id: 49, empresaId: 7, montoPagado: 200, montoOriginal: 500, facturaId: 12 };
    const { svc, asientosService } = makeService(pago, cxc);

    await svc.anularPago(902);

    expect(asientosService.revertirAsiento).toHaveBeenCalled();
  });
});
