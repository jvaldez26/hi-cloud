/**
 * Cancelar una factura revierte su asiento de venta.
 *
 * facturas.service.ts:cambiarEstado() → CANCELADA no tocaba contabilidad: el
 * asiento de venta (Debe Clientes/Haber Ventas+ITBIS) quedaba vivo para
 * siempre, inflando el balance. Ahora genera el contra-asiento vía
 * revertirAsiento(), fechado hoy (evento de reversión) — no la fecha de la
 * factura original.
 */

import { FacturasService } from './facturas.service';
import { FacturaEstado } from './entities/factura.entity';
import { TipoOrigenAsiento } from '../contabilidad/entities/asiento-contable.entity';

function makeService(factura: any) {
  const facturaRepository = {
    findOne: jest.fn().mockResolvedValue(factura),
    update:  jest.fn().mockResolvedValue({}),
    manager: { query: jest.fn().mockResolvedValue([]) },
  };
  const tenantService     = { getEmpresaId: () => factura.empresaId, getUserId: () => 5 };
  const inventarioService = { registrarDevolucion: jest.fn().mockResolvedValue({}) };
  const cxcService        = { anularPorFacturaId: jest.fn().mockResolvedValue(undefined) };
  const asientosService   = { revertirAsiento: jest.fn().mockResolvedValue({ id: 1 }) };
  const realtimeService   = { notify: jest.fn() };

  const svc: any = Object.create(FacturasService.prototype);
  svc.logger            = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
  svc.facturaRepository = facturaRepository;
  svc.tenantService     = tenantService;
  svc.inventarioService = inventarioService;
  svc.cxcService        = cxcService;
  svc.asientosService   = asientosService;
  svc.realtimeService   = realtimeService;
  return { svc, facturaRepository, inventarioService, cxcService, asientosService, realtimeService };
}

describe('FacturasService.cambiarEstado → CANCELADA revierte el asiento de venta', () => {
  it('cancelar una factura EMITIDA llama revertirAsiento(FACTURA, id, hoy, motivo con el folio)', async () => {
    const factura = {
      id: 77, folio: 'FAC-77', empresaId: 7, estado: FacturaEstado.EMITIDA,
      ecfId: null, detalles: [], usuarioId: 5,
    };
    const { svc, asientosService, facturaRepository, cxcService } = makeService(factura);

    await svc.cambiarEstado(77, FacturaEstado.CANCELADA);

    expect(asientosService.revertirAsiento).toHaveBeenCalledWith(
      TipoOrigenAsiento.FACTURA,
      77,
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), // fechaHoyRD(), no la fecha de la factura
      expect.stringContaining('FAC-77'),
    );
    expect(cxcService.anularPorFacturaId).toHaveBeenCalledWith(77);
    expect(facturaRepository.update).toHaveBeenCalledWith(77, { estado: FacturaEstado.CANCELADA });
  });

  it('no llama revertirAsiento si la transición no es válida (ya cancelada)', async () => {
    const factura = {
      id: 78, folio: 'FAC-78', empresaId: 7, estado: FacturaEstado.CANCELADA,
      ecfId: null, detalles: [], usuarioId: 5,
    };
    const { svc, asientosService } = makeService(factura);

    await expect(svc.cambiarEstado(78, FacturaEstado.CANCELADA)).rejects.toThrow();
    expect(asientosService.revertirAsiento).not.toHaveBeenCalled();
  });
});
