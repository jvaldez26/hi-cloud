import { BadRequestException } from '@nestjs/common';
import { FacturasService } from './facturas.service';

/**
 * reimprimir() — política 'reimprimir_factura' (Modo Supervisor). El guard
 * `RequiereSupervisor('reimprimir_factura')` del controller ya resolvió la
 * autorización ANTES de llegar aquí (si la política está activa); este
 * servicio decide qué hacer según esté o no activa, y SIEMPRE dicha
 * siempre deja un rastro en `factura_reimpresiones`.
 */
function makeCtx(opts: {
  requerido: boolean;
  modo?: 'sesion' | 'cada_vez';
  sesionActiva?: { supervisorId: number; supervisorNombre: string } | null;
  tokenRow?: { supervisorId: number; nombre: string } | null;
}) {
  const inserts: any[] = [];
  const query = jest.fn((sql: string, params?: any[]) => {
    if (sql.includes('FROM supervisor_politicas')) {
      return Promise.resolve([{ requerido: opts.requerido, modo: opts.modo ?? 'cada_vez' }]);
    }
    if (sql.includes('FROM pos_supervisor_log')) {
      return Promise.resolve(opts.sesionActiva ? [opts.sesionActiva] : []);
    }
    if (sql.includes('FROM supervisor_autorizaciones')) {
      return Promise.resolve(opts.tokenRow ? [opts.tokenRow] : []);
    }
    if (sql.includes('COALESCE(MAX(numero)')) {
      return Promise.resolve([{ n: 1 }]);
    }
    if (sql.includes('FROM cierres_caja')) {
      return Promise.resolve([{ id: 55 }]);
    }
    if (sql.includes('INSERT INTO factura_reimpresiones')) {
      inserts.push(params);
      return Promise.resolve([]);
    }
    return Promise.resolve([]);
  });
  const ctx: any = {
    tenantService: { getEmpresaId: () => 7 },
    dataSource:    { query },
    logger:        { log: jest.fn() },
    findOne:       jest.fn().mockResolvedValue({ id: 1, folio: 'FAC-0001', total: 1180 }),
    politicaReimprimir: (FacturasService.prototype as any).politicaReimprimir,
  };
  ctx.politicaReimprimir = ctx.politicaReimprimir.bind(ctx);
  return { ctx, inserts };
}

const USUARIO = { id: 5, nombre: 'Samuel' } as any;

describe('FacturasService.reimprimir', () => {
  it('política desactivada, SIN motivo: rechaza con 400, no imprime, no audita', async () => {
    const { ctx, inserts } = makeCtx({ requerido: false });
    await expect(
      (FacturasService.prototype as any).reimprimir.call(ctx, 1, 'termico', undefined, USUARIO),
    ).rejects.toThrow(BadRequestException);
    expect(inserts).toHaveLength(0);
  });

  it('política desactivada, motivo de menos de 5 caracteres: rechaza igual', async () => {
    const { ctx, inserts } = makeCtx({ requerido: false });
    await expect(
      (FacturasService.prototype as any).reimprimir.call(ctx, 1, 'termico', 'ok', USUARIO),
    ).rejects.toThrow(BadRequestException);
    expect(inserts).toHaveLength(0);
  });

  it('política desactivada, CON motivo válido: imprime y audita el motivo (sin supervisor)', async () => {
    const { ctx, inserts } = makeCtx({ requerido: false });
    const r: any = await (FacturasService.prototype as any).reimprimir.call(
      ctx, 1, 'termico', 'Cliente la pidió', USUARIO,
    );
    expect(r.reimpresionNumero).toBe(1);
    expect(inserts).toHaveLength(1);
    const [empresaId, facturaId, numero, usuarioId, usuarioNombre, formato, motivo, supervisorId, supervisorNombre, cajaId] = inserts[0];
    expect({ empresaId, facturaId, numero, usuarioId, usuarioNombre, formato, motivo, supervisorId, supervisorNombre, cajaId }).toEqual({
      empresaId: 7, facturaId: 1, numero: 1, usuarioId: 5, usuarioNombre: 'Samuel',
      formato: 'termico', motivo: 'Cliente la pidió', supervisorId: null, supervisorNombre: null, cajaId: 55,
    });
  });

  it('política activada, modo sesión: imprime sin motivo y audita quién autorizó (el guard ya validó la sesión)', async () => {
    const { ctx, inserts } = makeCtx({
      requerido: true, modo: 'sesion',
      sesionActiva: { supervisorId: 9, supervisorNombre: 'Jean Carlos Valdez' },
    });
    const r: any = await (FacturasService.prototype as any).reimprimir.call(ctx, 1, 'pdf', undefined, USUARIO);
    expect(r.reimpresionNumero).toBe(1);
    const [, , , , , , motivo, supervisorId, supervisorNombre] = inserts[0];
    expect(motivo).toBeNull();
    expect(supervisorId).toBe(9);
    expect(supervisorNombre).toBe('Jean Carlos Valdez');
  });

  it('política activada, modo cada_vez: imprime y audita al supervisor dueño del token ya consumido', async () => {
    const { ctx, inserts } = makeCtx({
      requerido: true, modo: 'cada_vez',
      tokenRow: { supervisorId: 9, nombre: 'Jean Carlos Valdez' },
    });
    const r: any = await (FacturasService.prototype as any).reimprimir.call(
      ctx, 1, 'termico', undefined, USUARIO, 'tok-abc123',
    );
    expect(r.reimpresionNumero).toBe(1);
    const [, , , , , , motivo, supervisorId, supervisorNombre] = inserts[0];
    expect(motivo).toBeNull();
    expect(supervisorId).toBe(9);
    expect(supervisorNombre).toBe('Jean Carlos Valdez');
  });

  it('cada reimpresión de la MISMA factura suma al consecutivo (REIMPRESIÓN #N)', async () => {
    const { ctx } = makeCtx({ requerido: false });
    ctx.dataSource.query = jest.fn((sql: string) => {
      if (sql.includes('COALESCE(MAX(numero)')) return Promise.resolve([{ n: 3 }]);
      if (sql.includes('FROM cierres_caja')) return Promise.resolve([]);
      return Promise.resolve([]);
    });
    const r: any = await (FacturasService.prototype as any).reimprimir.call(
      ctx, 1, 'termico', 'Ticket salió mal', USUARIO,
    );
    expect(r.reimpresionNumero).toBe(3);
  });
});
