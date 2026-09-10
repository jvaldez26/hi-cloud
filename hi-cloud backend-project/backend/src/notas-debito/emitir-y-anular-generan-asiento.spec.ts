/**
 * Nota de Débito: emitir genera su asiento; anular lo revierte.
 *
 * notas-debito.service.ts no tocaba contabilidad en absoluto. Una ND emitida
 * aumenta lo que debe el cliente, igual que una venta (Debe Clientes / Haber
 * Ventas + ITBIS por Pagar) — no es una reversa.
 */

import { NotasDebitoService } from './notas-debito.service';
import { EstadoNotaDebito } from './entities/nota-debito.entity';
import { TipoOrigenAsiento } from '../contabilidad/entities/asiento-contable.entity';

function makeService(nd: any) {
  const ndRepo = {
    findOne: jest.fn().mockResolvedValue(nd),
    update:  jest.fn((_id: number, data: any) => { Object.assign(nd, data); return Promise.resolve({}); }),
    manager: { query: jest.fn().mockResolvedValue([]) },
  };
  const tenantSvc       = { getEmpresaId: () => nd.empresaId };
  const asientosService = {
    asientoNotaDebito: jest.fn().mockResolvedValue(undefined),
    revertirAsiento:   jest.fn().mockResolvedValue({ id: 1 }),
  };

  const svc: any = Object.create(NotasDebitoService.prototype);
  svc.ndRepo          = ndRepo;
  svc.tenantSvc       = tenantSvc;
  svc.asientosService = asientosService;
  return { svc, ndRepo, asientosService };
}

describe('NotasDebitoService — emitir genera asiento, anular lo revierte', () => {
  it('emitir llama asientoNotaDebito con los montos de la ND', async () => {
    const nd = {
      id: 9, empresaId: 7, numero: 'ND-9', estado: EstadoNotaDebito.BORRADOR,
      total: 118, subtotal: 100, iva: 18, usuarioId: 5,
    };
    const { svc, asientosService, ndRepo } = makeService(nd);

    await svc.emitir(9);

    expect(ndRepo.update).toHaveBeenCalledWith(9, { estado: EstadoNotaDebito.EMITIDA });
    expect(asientosService.asientoNotaDebito).toHaveBeenCalledWith(9, 118, 100, 18, 'ND-9', 5);
  });

  it('no se puede emitir una ND que no está en BORRADOR', async () => {
    const nd = { id: 10, empresaId: 7, numero: 'ND-10', estado: EstadoNotaDebito.EMITIDA };
    const { svc, asientosService } = makeService(nd);

    await expect(svc.emitir(10)).rejects.toThrow();
    expect(asientosService.asientoNotaDebito).not.toHaveBeenCalled();
  });

  it('anular llama revertirAsiento(NOTA_DEBITO, nd.id, hoy, motivo con el número)', async () => {
    const nd = { id: 9, empresaId: 7, numero: 'ND-9', estado: EstadoNotaDebito.EMITIDA };
    const { svc, asientosService } = makeService(nd);

    await svc.anular(9);

    expect(asientosService.revertirAsiento).toHaveBeenCalledWith(
      TipoOrigenAsiento.NOTA_DEBITO,
      9,
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      expect.stringContaining('ND-9'),
    );
  });
});
