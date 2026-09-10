/**
 * Anular una CxC revierte el asiento de venta de su factura — con dos
 * guardas que protegen el balance y el 607:
 *
 * 1. Con abonos aplicados (montoPagado > 0), anular NO revierte nada — el
 *    asiento completo de la venta se revertiría con el cobro real ya en
 *    Bancos, dejando Clientes negativo. Solo una cuenta sin abonos
 *    (PENDIENTE) se anula directo. La salida: revertir el recibo de cobro
 *    primero (recibos-cobro.service.ts:eliminar ya revierte su propio
 *    asiento vía asientoReversion), lo que deja montoPagado en 0 otra vez.
 * 2. Si la factura origen tiene un e-CF confirmado por DGII (aceptado u
 *    observado), anular NO revierte el asiento — el comprobante ya está
 *    declarado; la corrección correcta es una Nota de Crédito.
 */

import { CxCService } from './cxc.service';
import { EstadoCuenta } from '../common/enums/estado-cuenta.enum';
import { TipoOrigenAsiento } from '../contabilidad/entities/asiento-contable.entity';

function makeService(cuenta: any, opts: { ecfRow?: { estadoDGII: string } } = {}) {
  const cxcRepository = {
    findOne: jest.fn().mockResolvedValue(cuenta),
    update:  jest.fn((_id: number, data: any) => { Object.assign(cuenta, data); return Promise.resolve({}); }),
  };
  const tenantService   = { getEmpresaId: () => cuenta?.empresaId };
  const asientosService = { revertirAsiento: jest.fn().mockResolvedValue({ id: 1 }) };
  const dataSource       = { query: jest.fn().mockResolvedValue(opts.ecfRow ? [opts.ecfRow] : []) };

  const svc: any = Object.create(CxCService.prototype);
  svc.logger          = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
  svc.cxcRepository   = cxcRepository;
  svc.tenantService   = tenantService;
  svc.asientosService = asientosService;
  svc.dataSource      = dataSource;
  return { svc, cxcRepository, asientosService, dataSource };
}

describe('CxCService.anular', () => {
  it('CxC PENDIENTE sin abonos: funciona igual que hoy — revierte el asiento', async () => {
    const cuenta = { id: 47, empresaId: 7, facturaId: 200, estado: EstadoCuenta.PENDIENTE, montoPagado: 0 };
    const { svc, asientosService, cxcRepository } = makeService(cuenta);

    await svc.anular(47);

    expect(cxcRepository.update).toHaveBeenCalledWith(47, { estado: EstadoCuenta.ANULADA });
    expect(asientosService.revertirAsiento).toHaveBeenCalledWith(
      TipoOrigenAsiento.FACTURA, 200, expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), expect.stringContaining('47'),
    );
  });

  it('CxC con un abono: rechaza con mensaje claro y NO revierte nada', async () => {
    const cuenta = { id: 47, empresaId: 7, facturaId: 200, estado: EstadoCuenta.PAGADA_PARCIAL, montoPagado: 400 };
    const { svc, asientosService, cxcRepository } = makeService(cuenta);

    await expect(svc.anular(47)).rejects.toThrow(/400.*abonad|abonad.*400/i);
    expect(cxcRepository.update).not.toHaveBeenCalled();
    expect(asientosService.revertirAsiento).not.toHaveBeenCalled();
  });

  it('CxC de factura con e-CF aceptado: rechaza y menciona la Nota de Crédito', async () => {
    const cuenta = { id: 48, empresaId: 7, facturaId: 201, estado: EstadoCuenta.PENDIENTE, montoPagado: 0 };
    const { svc, asientosService, cxcRepository } = makeService(cuenta, { ecfRow: { estadoDGII: 'aceptado' } });

    await expect(svc.anular(48)).rejects.toThrow(/nota de crédito/i);
    expect(cxcRepository.update).not.toHaveBeenCalled();
    expect(asientosService.revertirAsiento).not.toHaveBeenCalled();
  });

  it('CxC de factura con e-CF observado: también rechaza (mismo criterio que aceptado)', async () => {
    const cuenta = { id: 49, empresaId: 7, facturaId: 202, estado: EstadoCuenta.PENDIENTE, montoPagado: 0 };
    const { svc } = makeService(cuenta, { ecfRow: { estadoDGII: 'observado' } });

    await expect(svc.anular(49)).rejects.toThrow(/nota de crédito/i);
  });

  it('CxC de factura con e-CF rechazado: se comporta como hoy — sí revierte', async () => {
    const cuenta = { id: 50, empresaId: 7, facturaId: 203, estado: EstadoCuenta.PENDIENTE, montoPagado: 0 };
    const { svc, asientosService } = makeService(cuenta, { ecfRow: { estadoDGII: 'rechazado' } });

    await svc.anular(50);

    expect(asientosService.revertirAsiento).toHaveBeenCalled();
  });

  it('no se puede anular una CxC ya PAGADA', async () => {
    const cuenta = { id: 48, empresaId: 7, facturaId: 201, estado: EstadoCuenta.PAGADA, montoPagado: 1180 };
    const { svc, asientosService } = makeService(cuenta);

    await expect(svc.anular(48)).rejects.toThrow();
    expect(asientosService.revertirAsiento).not.toHaveBeenCalled();
  });

  it('revertir el recibo (montoPagado vuelve a 0) y luego anular: funciona', async () => {
    // Simula la secuencia: recibos-cobro.service.ts:eliminar ya dejó
    // montoPagado en 0 antes de que el usuario reintente anular().
    const cuenta = { id: 51, empresaId: 7, facturaId: 204, estado: EstadoCuenta.PENDIENTE, montoPagado: 0 };
    const { svc, asientosService, cxcRepository } = makeService(cuenta);

    await svc.anular(51);

    expect(cxcRepository.update).toHaveBeenCalledWith(51, { estado: EstadoCuenta.ANULADA });
    expect(asientosService.revertirAsiento).toHaveBeenCalled();
  });

  describe('anularPorFacturaId', () => {
    it('anula la CxC pendiente y revierte el asiento de la factura — retorna "anulada"', async () => {
      const cuenta = { id: 50, empresaId: 7, facturaId: 300, estado: EstadoCuenta.PENDIENTE, montoPagado: 0 };
      const { svc, asientosService, cxcRepository } = makeService(cuenta);

      const r = await svc.anularPorFacturaId(300);

      expect(r).toBe('anulada');
      expect(cxcRepository.update).toHaveBeenCalledWith(50, { estado: EstadoCuenta.ANULADA });
      expect(asientosService.revertirAsiento).toHaveBeenCalledWith(
        TipoOrigenAsiento.FACTURA, 300, expect.any(String), expect.any(String),
      );
    });

    it('sin CxC vinculada retorna "sin_cxc" y no llama revertirAsiento (factura de contado)', async () => {
      const { svc, asientosService, cxcRepository } = makeService(null);
      cxcRepository.findOne.mockResolvedValueOnce(null);

      const r = await svc.anularPorFacturaId(999);

      expect(r).toBe('sin_cxc');
      expect(asientosService.revertirAsiento).not.toHaveBeenCalled();
    });

    it('CxC ya PAGADA: retorna "bloqueada" sin revertir el asiento', async () => {
      const cuenta = { id: 51, empresaId: 7, facturaId: 301, estado: EstadoCuenta.PAGADA, montoPagado: 1180 };
      const { svc, asientosService } = makeService(cuenta);

      const r = await svc.anularPorFacturaId(301);

      expect(r).toBe('bloqueada');
      expect(asientosService.revertirAsiento).not.toHaveBeenCalled();
    });

    it('CxC con abonos: retorna "bloqueada" sin revertir el asiento', async () => {
      const cuenta = { id: 52, empresaId: 7, facturaId: 302, estado: EstadoCuenta.PAGADA_PARCIAL, montoPagado: 400 };
      const { svc, asientosService } = makeService(cuenta);

      const r = await svc.anularPorFacturaId(302);

      expect(r).toBe('bloqueada');
      expect(asientosService.revertirAsiento).not.toHaveBeenCalled();
    });

    it('factura con e-CF aceptado: retorna "bloqueada" sin revertir el asiento', async () => {
      const cuenta = { id: 53, empresaId: 7, facturaId: 303, estado: EstadoCuenta.PENDIENTE, montoPagado: 0 };
      const { svc, asientosService } = makeService(cuenta, { ecfRow: { estadoDGII: 'aceptado' } });

      const r = await svc.anularPorFacturaId(303);

      expect(r).toBe('bloqueada');
      expect(asientosService.revertirAsiento).not.toHaveBeenCalled();
    });
  });
});
