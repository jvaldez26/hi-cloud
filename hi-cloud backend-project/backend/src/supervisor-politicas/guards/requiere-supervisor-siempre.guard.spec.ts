import { ForbiddenException, ExecutionContext } from '@nestjs/common';
import { RequiereSupervisorSiempre } from './requiere-supervisor-siempre.guard';

/**
 * RequiereSupervisorSiempre('<clave>') — a diferencia de RequiereSupervisor,
 * NO hay bypass por rol: ni ADMIN ni CONTADOR se autorizan a sí mismos
 * (condonar_prestamo, ejecutar_garantia, reestructurar_prestamo,
 * anular_pago_prestamo). No tenía spec propio.
 *
 * Etapa 6 (Seguridad) le agregó soporte opcional de `soloSi` — igual que
 * RequiereSupervisor — para que
 * RefinanciamientoController.refinanciar() exija la MISMA autorización que
 * /prestamos/:id/condonar solo cuando el body realmente condona mora/interés
 * (ver refinanciamiento.controller.ts). Antes de ese cambio, cualquier
 * CONTADOR podía condonar deuda arbitraria llamando a /refinanciamientos en
 * vez de /condonar, sin ninguna autorización dual.
 */
describe('RequiereSupervisorSiempre guard', () => {
  const EMPRESA = 7;
  const USUARIO_ID = 1;

  function buildCtx(user: any, body: any = {}, headers: Record<string, string> = {}) {
    return {
      switchToHttp: () => ({
        getRequest: () => ({ user, body, headers }),
      }),
    } as unknown as ExecutionContext;
  }

  function buildGuard(clave: string, queryResponses: unknown[][], opts?: { soloSi?: (b: any) => boolean }) {
    const GuardClass = RequiereSupervisorSiempre(clave, opts);
    let i = 0;
    const query = jest.fn(() => Promise.resolve(queryResponses[i++] ?? []));
    const ds = { query };
    const cacheManager = { get: jest.fn(), set: jest.fn() };
    const guard = new (GuardClass as any)(ds, cacheManager);
    return { guard, query };
  }

  it('ADMIN con la política activa (cada_vez), sin token: 403 — ni el propio ADMIN se autoriza', async () => {
    const { guard } = buildGuard('condonar_prestamo', [[{ requerido: true, modo: 'cada_vez' }]]);
    const ctx = buildCtx({ id: USUARIO_ID, role: 'admin', empresaId: EMPRESA });
    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });

  it('ADMIN con token válido de OTRA persona: pasa', async () => {
    const { guard } = buildGuard('condonar_prestamo', [[{ requerido: true, modo: 'cada_vez' }], [{ id: 1 }]]);
    const ctx = buildCtx({ id: USUARIO_ID, role: 'admin', empresaId: EMPRESA }, {}, { 'x-supervisor-token': 'tok1' });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('clave desmarcada (requerido=false): pasa sin pedir nada, incluso a ADMIN', async () => {
    const { guard } = buildGuard('condonar_prestamo', [[{ requerido: false, modo: 'cada_vez' }]]);
    const ctx = buildCtx({ id: USUARIO_ID, role: 'admin', empresaId: EMPRESA });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('sin empresaId: pasa (nada que resolver sin contexto de empresa)', async () => {
    const { guard, query } = buildGuard('condonar_prestamo', []);
    const ctx = buildCtx({ id: USUARIO_ID, role: 'admin', empresaId: null });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(query).not.toHaveBeenCalled();
  });

  describe('soloSi — caso real: condonar mora/interés vía refinanciamiento', () => {
    const condonaAlRefinanciar = (body: any) =>
      Number(body?.moraCondonada ?? 0) > 0 || Number(body?.interesCondonado ?? 0) > 0;

    it('refinanciamiento SIN condonación: pasa sin consultar la política — nunca pide autorización', async () => {
      const { guard, query } = buildGuard('condonar_prestamo', [], { soloSi: condonaAlRefinanciar });
      const ctx = buildCtx(
        { id: USUARIO_ID, role: 'contador', empresaId: EMPRESA },
        { prestamoOriginalId: 10, nuevoPlazo: 12 }, // sin moraCondonada/interesCondonado
      );
      await expect(guard.canActivate(ctx)).resolves.toBe(true);
      expect(query).not.toHaveBeenCalled();
    });

    // Este es el hueco real que Etapa 6 encontró y cerró: un CONTADOR podía
    // condonar mora/interés arbitrario llamando a /refinanciamientos en vez
    // de /condonar (que exige RequiereSupervisorSiempre('condonar_prestamo')
    // SIEMPRE), porque /refinanciamientos no tenía este guard en absoluto.
    it('refinanciamiento CON moraCondonada > 0, sin autorización: 403 — mismo control que /condonar', async () => {
      const { guard } = buildGuard(
        'condonar_prestamo',
        [[{ requerido: true, modo: 'cada_vez' }]],
        { soloSi: condonaAlRefinanciar },
      );
      const ctx = buildCtx(
        { id: USUARIO_ID, role: 'contador', empresaId: EMPRESA },
        { prestamoOriginalId: 10, moraCondonada: 500 },
      );
      await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
    });

    it('refinanciamiento CON interesCondonado > 0, sin autorización: 403', async () => {
      const { guard } = buildGuard(
        'condonar_prestamo',
        [[{ requerido: true, modo: 'cada_vez' }]],
        { soloSi: condonaAlRefinanciar },
      );
      const ctx = buildCtx(
        { id: USUARIO_ID, role: 'contador', empresaId: EMPRESA },
        { prestamoOriginalId: 10, interesCondonado: 200 },
      );
      await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
    });

    it('refinanciamiento CON condonación y token válido de OTRA persona: pasa', async () => {
      const { guard } = buildGuard(
        'condonar_prestamo',
        [[{ requerido: true, modo: 'cada_vez' }], [{ id: 1 }]],
        { soloSi: condonaAlRefinanciar },
      );
      const ctx = buildCtx(
        { id: USUARIO_ID, role: 'contador', empresaId: EMPRESA },
        { prestamoOriginalId: 10, moraCondonada: 500 },
        { 'x-supervisor-token': 'tok1' },
      );
      await expect(guard.canActivate(ctx)).resolves.toBe(true);
    });
  });
});
