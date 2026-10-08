/**
 * Caso real: empresa 73, FAC-1705/1708-1714 (2026-10-07) — el envío síncrono
 * del POS falló/dio timeout (429/403) y la factura quedó EMITIDA (nunca
 * PAGADA sin e-CF confirmado, por diseño). Cuando el e-CF se confirmó
 * ACEPTADO después (cron o reconciliación), nada volvía a sellar PAGADA
 * aunque el dinero (formasPago) ya estaba registrado desde la creación.
 */
import { Logger } from '@nestjs/common';
import { sellarFacturaPagadaSiCorresponde } from './sellar-factura-pagada.helper';
import { FacturaEstado } from '../../facturas/entities/factura.entity';

function buildFacturaRepo(factura: any, rastroExiste = false) {
  return {
    findOne: jest.fn().mockResolvedValue(factura),
    update:  jest.fn().mockResolvedValue(undefined),
    manager: { query: jest.fn().mockResolvedValue([{ existe: rastroExiste }]) },
  };
}

const logger = new Logger('test');
jest.spyOn(logger, 'log').mockImplementation(() => undefined);
jest.spyOn(logger, 'warn').mockImplementation(() => undefined);

describe('sellarFacturaPagadaSiCorresponde', () => {
  it('EMITIDA + formasPago con datos → sella PAGADA y notifica por realtime', async () => {
    const factura = { id: 1, folio: 'FAC-1705', estado: FacturaEstado.EMITIDA, tipoPago: 'CONTADO', formasPago: [{ tipo: 1, monto: 500 }] };
    const facturaRepo = buildFacturaRepo(factura);
    const realtime = { notify: jest.fn() };

    const sellada = await sellarFacturaPagadaSiCorresponde(facturaRepo as any, 1, logger, realtime as any);

    expect(sellada).toBe(true);
    expect(facturaRepo.update).toHaveBeenCalledWith(1, { estado: FacturaEstado.PAGADA });
  });

  it('EMITIDA sin formasPago pero con recibo de cobro/CxC pago/NC con efectos → igual sella PAGADA', async () => {
    const factura = { id: 2, folio: 'FAC-X', estado: FacturaEstado.EMITIDA, tipoPago: 'CONTADO', formasPago: null };
    const facturaRepo = buildFacturaRepo(factura, /* rastroExiste */ true);

    const sellada = await sellarFacturaPagadaSiCorresponde(facturaRepo as any, 2, logger);

    expect(sellada).toBe(true);
    expect(facturaRepo.update).toHaveBeenCalledWith(2, { estado: FacturaEstado.PAGADA });
  });

  it('EMITIDA sin ningún rastro de cobro → NO sella (se queda EMITIDA, sin lanzar)', async () => {
    const factura = { id: 3, folio: 'FAC-Y', estado: FacturaEstado.EMITIDA, tipoPago: 'CONTADO', formasPago: [] };
    const facturaRepo = buildFacturaRepo(factura, /* rastroExiste */ false);

    const sellada = await sellarFacturaPagadaSiCorresponde(facturaRepo as any, 3, logger);

    expect(sellada).toBe(false);
    expect(facturaRepo.update).not.toHaveBeenCalled();
  });

  it('idempotente: factura ya PAGADA → no hace nada', async () => {
    const factura = { id: 4, folio: 'FAC-Z', estado: FacturaEstado.PAGADA, tipoPago: 'CONTADO', formasPago: [{ tipo: 1, monto: 100 }] };
    const facturaRepo = buildFacturaRepo(factura);

    const sellada = await sellarFacturaPagadaSiCorresponde(facturaRepo as any, 4, logger);

    expect(sellada).toBe(false);
    expect(facturaRepo.update).not.toHaveBeenCalled();
  });

  it('CANCELADA → no hace nada (idempotente, no revive una factura cancelada)', async () => {
    const factura = { id: 5, folio: 'FAC-W', estado: FacturaEstado.CANCELADA, tipoPago: 'CONTADO', formasPago: [{ tipo: 1, monto: 100 }] };
    const facturaRepo = buildFacturaRepo(factura);

    const sellada = await sellarFacturaPagadaSiCorresponde(facturaRepo as any, 5, logger);

    expect(sellada).toBe(false);
    expect(facturaRepo.update).not.toHaveBeenCalled();
  });

  it('venta a CRÉDITO → nunca la toca (su PAGADA viene del flujo de cobro/CxC, no del e-CF)', async () => {
    const factura = { id: 6, folio: 'FAC-CRED', estado: FacturaEstado.EMITIDA, tipoPago: 'CREDITO', formasPago: null };
    const facturaRepo = buildFacturaRepo(factura, /* rastroExiste */ true); // aunque hubiera "rastro", no debe tocarla

    const sellada = await sellarFacturaPagadaSiCorresponde(facturaRepo as any, 6, logger);

    expect(sellada).toBe(false);
    expect(facturaRepo.update).not.toHaveBeenCalled();
  });

  it('factura inexistente → no lanza, devuelve false', async () => {
    const facturaRepo = buildFacturaRepo(null);

    const sellada = await sellarFacturaPagadaSiCorresponde(facturaRepo as any, 999, logger);

    expect(sellada).toBe(false);
  });
});
