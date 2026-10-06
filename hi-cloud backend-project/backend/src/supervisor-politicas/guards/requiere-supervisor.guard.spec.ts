import { ForbiddenException, ExecutionContext } from '@nestjs/common';
import { RequiereSupervisor } from './requiere-supervisor.guard';

/**
 * RequiereSupervisor('<clave>') — reemplaza a SupervisorGateGuard con una
 * condición por empresa (antes era todo o nada para cualquier vendedor).
 * Tests pedidos explícitamente: una clave marcada (requerido=true) sin
 * autorización → 403 también por API directa; desmarcada → pasa.
 */
describe('RequiereSupervisor guard', () => {
  const EMPRESA = 7;
  const CAJERO = 10;

  function buildCtx(user: any, body: any = {}, headers: Record<string, string> = {}) {
    return {
      switchToHttp: () => ({
        getRequest: () => ({ user, body, headers }),
      }),
    } as unknown as ExecutionContext;
  }

  function buildGuard(clave: string, queryResponses: unknown[][], opts?: { soloSi?: (b: any) => boolean }) {
    const GuardClass = RequiereSupervisor(clave, opts);
    let i = 0;
    const query = jest.fn(() => Promise.resolve(queryResponses[i++] ?? []));
    const ds = { query };
    const guard = new (GuardClass as any)(ds);
    return { guard, query };
  }

  it('admin/contador/super_admin pasan siempre, sin consultar nada', async () => {
    for (const role of ['admin', 'contador', 'super_admin']) {
      const { guard, query } = buildGuard('crear_producto', []);
      const ctx = buildCtx({ id: 1, role, empresaId: EMPRESA });
      await expect(guard.canActivate(ctx)).resolves.toBe(true);
      expect(query).not.toHaveBeenCalled();
    }
  });

  it('clave desmarcada (requerido=false) → pasa, sin más chequeos', async () => {
    const { guard, query } = buildGuard('crear_producto', [[{ requerido: false, modo: 'sesion' }]]);
    const ctx = buildCtx({ id: CAJERO, role: 'vendedor', empresaId: EMPRESA });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('clave marcada (modo sesión), sin sesión activa → 403', async () => {
    const { guard } = buildGuard('crear_producto', [[{ requerido: true, modo: 'sesion' }], []]);
    const ctx = buildCtx({ id: CAJERO, role: 'vendedor', empresaId: EMPRESA });
    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });

  it('clave marcada (modo sesión), CON sesión activa → pasa', async () => {
    const { guard } = buildGuard('crear_producto', [[{ requerido: true, modo: 'sesion' }], [{ id: 1 }]]);
    const ctx = buildCtx({ id: CAJERO, role: 'vendedor', empresaId: EMPRESA });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('clave marcada (modo cada_vez), sin header de token → 403, nunca consulta la BD para el token', async () => {
    const { guard, query } = buildGuard('cerrar_caja', [[{ requerido: true, modo: 'cada_vez' }]]);
    const ctx = buildCtx({ id: CAJERO, role: 'vendedor', empresaId: EMPRESA });
    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
    expect(query).toHaveBeenCalledTimes(1); // solo la política, nunca intenta consumir un token inexistente
  });

  it('clave marcada (modo cada_vez), con token que no consume fila (vencido/usado/ajeno) → 403', async () => {
    const { guard } = buildGuard('cerrar_caja', [[{ requerido: true, modo: 'cada_vez' }], []]);
    const ctx = buildCtx({ id: CAJERO, role: 'vendedor', empresaId: EMPRESA }, {}, { 'x-supervisor-token': 'tok1' });
    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });

  it('clave marcada (modo cada_vez), con token válido → pasa', async () => {
    const { guard } = buildGuard('cerrar_caja', [[{ requerido: true, modo: 'cada_vez' }], [{ id: 1 }]]);
    const ctx = buildCtx({ id: CAJERO, role: 'vendedor', empresaId: EMPRESA }, {}, { 'x-supervisor-token': 'tok1' });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('sin fila en supervisor_politicas (empresa nunca migrada) → usa el default del catálogo', async () => {
    // 'crear_producto' por defecto es requerido=true en el catálogo.
    const { guard } = buildGuard('crear_producto', [[], []]);
    const ctx = buildCtx({ id: CAJERO, role: 'vendedor', empresaId: EMPRESA });
    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });

  it('clave no catalogada → pasa siempre (bug de programación, no una política real)', async () => {
    const { guard, query } = buildGuard('clave-que-no-existe', []);
    const ctx = buildCtx({ id: CAJERO, role: 'vendedor', empresaId: EMPRESA });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(query).not.toHaveBeenCalled();
  });

  it('soloSi: cuando la condición no aplica, pasa sin consultar la política', async () => {
    const { guard, query } = buildGuard('anular_documento', [], { soloSi: b => b?.estado === 'cancelada' });
    const ctx = buildCtx({ id: CAJERO, role: 'vendedor', empresaId: EMPRESA }, { estado: 'emitida' });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(query).not.toHaveBeenCalled();
  });

  it('sin empresaId en el usuario → 403 explícito de contexto', async () => {
    const { guard } = buildGuard('crear_producto', []);
    const ctx = buildCtx({ id: CAJERO, role: 'vendedor', empresaId: null });
    await expect(guard.canActivate(ctx)).rejects.toThrow('Se requiere contexto de empresa activa.');
  });
});
