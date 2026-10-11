import { BadRequestException } from '@nestjs/common';
import { resolverCajaDiariaPrestamo } from './caja-efectivo.util';

/**
 * Etapa 5, Parte B — ver docs/prestamista/etapa-5-contabilidad-caja-fiscal.md.
 * `queryable.query` se despacha por contenido del SQL, igual que el resto de
 * los tests de este módulo (sin Postgres real).
 */
function queryable(respuestas: { empresa?: any; caja?: any }) {
  return {
    query: jest.fn(async (sql: string) => {
      if (sql.includes('FROM empresa')) return [respuestas.empresa ?? {}];
      if (sql.includes('FROM cierres_caja')) return respuestas.caja != null ? [respuestas.caja] : [];
      return [];
    }),
  };
}

describe('resolverCajaDiariaPrestamo', () => {
  it('sin cajaDiariaId: no hace ninguna consulta y devuelve null', async () => {
    const q = queryable({});
    const r = await resolverCajaDiariaPrestamo(q as any, 1, 'efectivo', undefined);
    expect(r).toBeNull();
    expect(q.query).not.toHaveBeenCalled();
  });

  it('metodoPago distinto de efectivo: ignora el cajaDiariaId aunque venga, sin consultar nada', async () => {
    const q = queryable({});
    const r = await resolverCajaDiariaPrestamo(q as any, 1, 'transferencia', 7);
    expect(r).toBeNull();
    expect(q.query).not.toHaveBeenCalled();
  });

  it('pago mixto (metodoPago="mixto"): tampoco entra, aunque haya una línea en efectivo', async () => {
    const q = queryable({});
    const r = await resolverCajaDiariaPrestamo(q as any, 1, 'mixto', 7);
    expect(r).toBeNull();
    expect(q.query).not.toHaveBeenCalled();
  });

  it('empresa con el interruptor apagado: devuelve null sin validar la caja', async () => {
    const q = queryable({ empresa: { configuracion: { prestamoEfectivoPorCaja: false } } });
    const r = await resolverCajaDiariaPrestamo(q as any, 1, 'efectivo', 7);
    expect(r).toBeNull();
  });

  it('empresa que nunca tocó el switch: default encendido', async () => {
    const q = queryable({ empresa: { configuracion: {} }, caja: { estado: 'abierta' } });
    const r = await resolverCajaDiariaPrestamo(q as any, 1, 'efectivo', 7);
    expect(r).toBe(7);
  });

  it('caja que no existe o es de OTRA empresa: rechaza (fuga multi-tenant)', async () => {
    const q = queryable({ empresa: {}, caja: null });
    await expect(resolverCajaDiariaPrestamo(q as any, 1, 'efectivo', 999))
      .rejects.toThrow(BadRequestException);
  });

  it('caja ya cerrada: rechaza', async () => {
    const q = queryable({ empresa: {}, caja: { estado: 'cerrada' } });
    await expect(resolverCajaDiariaPrestamo(q as any, 1, 'efectivo', 7))
      .rejects.toThrow(BadRequestException);
  });

  it('caja abierta de la empresa correcta: acepta y devuelve el mismo id', async () => {
    const q = queryable({ empresa: {}, caja: { estado: 'abierta' } });
    const r = await resolverCajaDiariaPrestamo(q as any, 1, 'efectivo', 7);
    expect(r).toBe(7);
  });
});
