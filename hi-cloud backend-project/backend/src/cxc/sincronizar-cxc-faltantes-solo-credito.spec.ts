/**
 * CxcService.sincronizarCxCFaltantes() — debe crear CxC SOLO para facturas
 * CREDITO. El filtro `tipoPago = 'CREDITO'` faltaba en el SQL: creaba CxC
 * para cualquier factura emitida sin una, incluyendo CONTADO (que nunca
 * debe tener CxC — una venta de contado ya se cobró al emitirse).
 *
 * Caso real (empresa 53, 2026-10-03): este endpoint creó 6 CxC fantasma
 * (RD$253,722.85) sobre facturas de Transporte/Viajes CONTADO — el módulo
 * de Transporte nunca tuvo el bug (siempre marca tipoPago='CONTADO' al
 * crear), el bug estaba enteramente aquí.
 */
import { CxCService } from './cxc.service';

function makeService(queryImpl: jest.Mock) {
  const svc: any = Object.create(CxCService.prototype);
  svc.logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
  svc.dataSource = { query: queryImpl };
  svc.tenantService = { getEmpresaId: () => 53 };
  svc.crear = jest.fn().mockResolvedValue({});
  return svc as CxCService;
}

describe('CxCService.sincronizarCxCFaltantes — solo facturas CREDITO', () => {
  it('el SQL exige tipoPago = CREDITO explícitamente', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const svc = makeService(query);

    await svc.sincronizarCxCFaltantes();

    expect(query).toHaveBeenCalledWith(expect.stringContaining(`f."tipoPago"  = 'CREDITO'`), [53]);
  });

  it('con una factura CREDITO sin CxC: la crea', async () => {
    const query = jest.fn().mockResolvedValue([
      { id: 10, usuarioId: 5, diasCredito: 30, folio: 'FAC-10' },
    ]);
    const svc: any = makeService(query);

    const r = await svc.sincronizarCxCFaltantes();

    expect(svc.crear).toHaveBeenCalledWith(10, 5, 30);
    expect(r).toEqual({ creadas: 1, folios: ['FAC-10'] });
  });

  it('sin facturas CREDITO faltantes (el SQL ya filtra): no crea nada', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const svc: any = makeService(query);

    const r = await svc.sincronizarCxCFaltantes();

    expect(svc.crear).not.toHaveBeenCalled();
    expect(r).toEqual({ creadas: 0, folios: [] });
  });
});
