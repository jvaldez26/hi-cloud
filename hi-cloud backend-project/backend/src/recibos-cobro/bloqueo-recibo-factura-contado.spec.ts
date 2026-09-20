/**
 * FIX 3, FASE A commit 2 (2026-09-20) — doble compensación: una factura de
 * CONTADO nunca genera CxC (ya se cobró al emitirse, ver
 * asiento-factura-metodo-pago.spec.ts), pero antes de este fix
 * RecibosCobrosService.crear() trataba "sin CxC" como "es un anticipo" sin
 * distinguir por qué no había CxC — un cajero podía registrar OTRO cobro
 * contra una factura de contado ya pagada, acreditando Clientes cuando
 * nunca se le había debitado nada a esa cuenta por esa factura.
 */

import { RecibosCobrosService } from './recibos-cobro.service';
import { BadRequestException } from '@nestjs/common';

function makeService(opts: { factura: any; cxcEncontrada: any }) {
  const repo = { create: jest.fn(), save: jest.fn() };
  const cxcRepo = { findOne: jest.fn().mockResolvedValue(opts.cxcEncontrada) };
  const facturaRepo = { findOne: jest.fn().mockResolvedValue(opts.factura) };
  const anticipoRepo = {};
  const dataSource = { query: jest.fn().mockResolvedValue([]) };
  const asientosService = {};
  const tesoreriaService = {};
  const tenantSvc = { getEmpresaId: () => 7 };

  const svc: any = Object.create(RecibosCobrosService.prototype);
  svc.logger           = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
  svc.repo             = repo;
  svc.cxcRepo          = cxcRepo;
  svc.facturaRepo      = facturaRepo;
  svc.anticipoRepo     = anticipoRepo;
  svc.dataSource       = dataSource;
  svc.asientosService  = asientosService;
  svc.tesoreriaService = tesoreriaService;
  svc.tenantSvc        = tenantSvc;
  return svc as RecibosCobrosService;
}

describe('RecibosCobrosService.crear — bloquea el cobro contra una factura de contado ya pagada', () => {
  it('factura CONTADO sin CxC: rechaza con BadRequestException (doble compensación)', async () => {
    const svc = makeService({
      factura: { id: 10, folio: 'FAC-10', tipoPago: 'CONTADO', empresaId: 7, moneda: 'DOP', anulacionPendiente: false },
      cxcEncontrada: null,
    });

    await expect(svc.crear(
      { facturaId: 10, monto: 100, metodoPago: 'efectivo', concepto: 'Cobro' }, 5,
    )).rejects.toThrow(BadRequestException);
  });

  it('factura CREDITO sin CxC (aún no generada): NO dispara el guard de "factura de contado"', async () => {
    const svc: any = makeService({
      factura: { id: 11, folio: 'FAC-11', tipoPago: 'CREDITO', empresaId: 7, moneda: 'DOP', anulacionPendiente: false },
      cxcEncontrada: null,
    });
    // No hay CxC ⇒ entra a la rama "sin CxC — anticipo o cobro genérico".
    // Este test no reconstruye esa rama completa (tesorería, caja diaria,
    // etc. — fuera del alcance del guard nuevo) — solo confirma que, sea
    // cual sea el resultado final, NO es el BadRequestException de
    // "factura de contado" que este commit introduce.
    await svc.crear({ facturaId: 11, monto: 100, metodoPago: 'efectivo', concepto: 'Anticipo' }, 5)
      .catch((err: unknown) => {
        expect(err).not.toBeInstanceOf(BadRequestException);
      });
  });

  it('factura con CxC existente: no se ve afectada por el nuevo guard (nunca llega a evaluarlo)', async () => {
    const svc: any = makeService({
      factura: { id: 12, folio: 'FAC-12', tipoPago: 'CREDITO', empresaId: 7, moneda: 'DOP', anulacionPendiente: false },
      cxcEncontrada: { id: 90, empresaId: 7, clienteId: 1, estado: 'pendiente', montoPendiente: 100, montoPagado: 0, montoOriginal: 100, moneda: 'DOP', tipoCambio: 1 },
    });
    // Con CxC resuelta, la condición del guard (!cxc && ...) es falsa por
    // construcción — ni siquiera se evalúa el tipoPago. Confirma que llegar
    // hasta acá (más allá de la resolución de CxC) no lanza ese error.
    await svc.crear({ facturaId: 12, monto: 50, metodoPago: 'efectivo', concepto: 'Abono' }, 5)
      .catch((err: unknown) => {
        expect(err).not.toBeInstanceOf(BadRequestException);
      });
  });
});
