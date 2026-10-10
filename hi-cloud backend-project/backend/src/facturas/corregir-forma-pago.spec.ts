import { BadRequestException, NotFoundException } from '@nestjs/common';
import { FacturasService } from './facturas.service';
import { FacturaEstado } from './entities/factura.entity';
import { AccionAuditoria } from '../auditoria/entities/audit-log.entity';

/**
 * FacturasService.corregirFormaPago — caso real empresa 73 (2026-10-09):
 * FAC-1803 se registró con tarjeta y efectivo invertidos. El total nunca
 * cambia, solo cómo se repartió entre formas de pago. Se invoca el método
 * directamente sobre un `ctx` mínimo, mismo patrón que
 * formas-pago.invariantes.spec.ts: no hace falta levantar el módulo Nest
 * completo para probar lógica de servicio.
 */
describe('FacturasService.corregirFormaPago', () => {
  function makeCtx(factura: any) {
    const ctx = {
      tenantService: { getEmpresaId: () => 7 },
      facturaRepository: {
        findOne: jest.fn().mockResolvedValue(factura),
        update:  jest.fn().mockResolvedValue(undefined),
      },
      auditoriaService: { registrar: jest.fn().mockResolvedValue(undefined) },
      cajaService: { registrarAjusteSiCierreCerrado: jest.fn().mockResolvedValue(undefined) },
    };
    const call = (id: number, formasPagoNuevo: any[], motivo: string, usuario: any) =>
      (FacturasService.prototype as any).corregirFormaPago.call(ctx, id, formasPagoNuevo, motivo, usuario);
    return { ctx, call };
  }

  const facturaBase = (overrides: any = {}) => ({
    id: 1803, folio: 'FAC-1803', empresaId: 7, total: 1080,
    estado: FacturaEstado.EMITIDA, vendedorId: 12,
    fecha: new Date('2026-10-09T00:00:00.000Z'),
    formasPago: [{ tipo: 3, monto: 955 }, { tipo: 1, monto: 125 }], // Tarjeta/Efectivo invertidos
    ...overrides,
  });

  it('corrige el reparto invertido de FAC-1803 (Tarjeta 955 + Efectivo 125 → Efectivo 955 + Tarjeta 125)', async () => {
    const { ctx, call } = makeCtx(facturaBase());

    const corregido = [{ tipo: 1, monto: 955 }, { tipo: 3, monto: 125 }];
    const resultado = await call(1803, corregido, 'Cajera invirtió tarjeta y efectivo al cobrar', { id: 1, nombre: 'Jean Admin' });

    expect(resultado.formasPago).toEqual(corregido);
    expect(ctx.facturaRepository.update).toHaveBeenCalledWith(1803, { formasPago: corregido });

    const auditLog = ctx.auditoriaService.registrar.mock.calls[0][0];
    expect(auditLog.accion).toBe(AccionAuditoria.UPDATE);
    expect(auditLog.modulo).toBe('facturas');
    expect(JSON.parse(auditLog.valorAnterior)).toEqual([{ tipo: 3, monto: 955 }, { tipo: 1, monto: 125 }]);
    expect(JSON.parse(auditLog.valorNuevo)).toEqual(corregido);
    expect(auditLog.descripcion).toContain('Cajera invirtió');

    expect(ctx.cajaService.registrarAjusteSiCierreCerrado).toHaveBeenCalledWith(
      { id: 1803, folio: 'FAC-1803', fecha: expect.any(Date), vendedorId: 12 },
      [{ tipo: 3, monto: 955 }, { tipo: 1, monto: 125 }],
      corregido,
      'Cajera invirtió tarjeta y efectivo al cobrar',
      { id: 1, nombre: 'Jean Admin' },
    );
  });

  it('rechaza si las formas nuevas no suman el total de la factura', async () => {
    const { call } = makeCtx(facturaBase({ total: 1080 }));
    await expect(
      call(1803, [{ tipo: 1, monto: 900 }], 'motivo', { id: 1 }),
    ).rejects.toThrow(BadRequestException);
  });

  it('tolera el céntimo de redondeo (0.01)', async () => {
    const { call } = makeCtx(facturaBase({ total: 1080 }));
    await expect(
      call(1803, [{ tipo: 1, monto: 1080.01 }], 'motivo', { id: 1 }),
    ).resolves.toBeDefined();
  });

  it('factura inexistente: NotFoundException', async () => {
    const { call } = makeCtx(null);
    await expect(call(999, [], 'motivo', { id: 1 })).rejects.toThrow(NotFoundException);
  });

  it('rechaza corregir una factura en BORRADOR o CANCELADA', async () => {
    const { call: callBorrador } = makeCtx(facturaBase({ estado: FacturaEstado.BORRADOR }));
    await expect(
      callBorrador(1803, [{ tipo: 1, monto: 1080 }], 'motivo', { id: 1 }),
    ).rejects.toThrow(BadRequestException);

    const { call: callCancelada } = makeCtx(facturaBase({ estado: FacturaEstado.CANCELADA }));
    await expect(
      callCancelada(1803, [{ tipo: 1, monto: 1080 }], 'motivo', { id: 1 }),
    ).rejects.toThrow(BadRequestException);
  });

  it('no toca nada relacionado con el e-CF — solo formasPago, auditoría y el posible ajuste de cierre', async () => {
    const { ctx, call } = makeCtx(facturaBase());
    await call(1803, [{ tipo: 1, monto: 955 }, { tipo: 3, monto: 125 }], 'motivo', { id: 1 });

    // El único cambio en la factura es formasPago — nada de estado, ecf, etc.
    const [, cambios] = ctx.facturaRepository.update.mock.calls[0];
    expect(Object.keys(cambios)).toEqual(['formasPago']);
  });
});
