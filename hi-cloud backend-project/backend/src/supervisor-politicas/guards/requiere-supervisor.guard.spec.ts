import { ForbiddenException, ExecutionContext } from '@nestjs/common';
import { RequiereSupervisor } from './requiere-supervisor.guard';

/**
 * RequiereSupervisor('<clave>') — reemplaza a SupervisorGateGuard con una
 * condición por empresa (antes era todo o nada para cualquier vendedor).
 * Tests pedidos explícitamente: una clave marcada (requerido=true) sin
 * autorización → 403 también por API directa; desmarcada → pasa.
 *
 * Bug real (2026-10-09, encontrado vía Cierre de Caja — empresa de Samuel):
 * el guard comparaba contra `user.role`, la columna GLOBAL de `users` — que
 * solo se sincroniza con la empresa PRINCIPAL del usuario. Un cajero
 * VENDEDOR en una empresa secundaria cuyo rol global fuera otro (p.ej.
 * admin/contador en su empresa principal) pasaba CUALQUIER política sin que
 * se le pidiera nunca autorización. El fix resuelve el rol de la empresa
 * ACTIVA vía `usuario_empresa` — por eso `buildCtx` de abajo pone a
 * propósito un `user.role` DISTINTO del rol real de la empresa en casi
 * todos los casos: si algún test pasara leyendo ese campo en vez del
 * resultado de la consulta, lo delataría.
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

  /**
   * `rolEmpresa`: lo que devuelve la consulta a `usuario_empresa` para
   * (userId, empresaId) — null simula "sin fila" (p.ej. empresaId ausente
   * nunca llega a consultar, o un 404 de membresía). `queryResponses` son
   * las respuestas DESPUÉS de esa — política, sesión activa, token — en el
   * mismo orden que antes.
   */
  function buildGuard(
    clave: string,
    rolEmpresa: string | null,
    queryResponses: unknown[][],
    opts?: { soloSi?: (b: any) => boolean },
  ) {
    const GuardClass = RequiereSupervisor(clave, opts);
    const respuestas = [rolEmpresa != null ? [{ rol: rolEmpresa }] : [], ...queryResponses];
    let i = 0;
    const query = jest.fn(() => Promise.resolve(respuestas[i++] ?? []));
    const ds = { query };
    // Cache siempre en blanco (miss) — el guard cae a la consulta directa,
    // que es lo que estos tests controlan vía `rolEmpresa`.
    const cacheManager = { get: jest.fn().mockResolvedValue(undefined), set: jest.fn().mockResolvedValue(undefined) };
    const guard = new (GuardClass as any)(ds, cacheManager);
    return { guard, query, cacheManager };
  }

  it('admin/contador/super_admin EN LA EMPRESA ACTIVA pasan siempre, sin consultar la política (user.role global dice otra cosa a propósito)', async () => {
    for (const rolEmpresa of ['admin', 'contador', 'super_admin']) {
      const { guard, query } = buildGuard('crear_producto', rolEmpresa, []);
      // user.role = 'vendedor' (global) — si el guard lo leyera a él en vez
      // de rolEmpresa, este test fallaría (exigiría autorización).
      const ctx = buildCtx({ id: 1, role: 'vendedor', empresaId: EMPRESA });
      await expect(guard.canActivate(ctx)).resolves.toBe(true);
      expect(query).toHaveBeenCalledTimes(1); // solo el lookup de rol — nunca llega a la política
    }
  });

  it('REGRESIÓN (Samuel, 2026-10-09): rol global NO es vendedor pero el de ESTA empresa sí — el guard SÍ exige autorización', async () => {
    // user.role (columna global, sincronizada con su empresa PRINCIPAL) es
    // 'admin' — pero en la empresa activa (usuario_empresa) es 'vendedor'.
    // Antes del fix, esto pasaba sin pedir nada.
    const { guard } = buildGuard('crear_producto', 'vendedor', [[{ requerido: true, modo: 'sesion' }], []]);
    const ctx = buildCtx({ id: CAJERO, role: 'admin', empresaId: EMPRESA });
    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });

  it('REGRESIÓN inversa: rol global ES vendedor pero el de ESTA empresa es admin — el guard NO exige nada', async () => {
    // Prueba que el guard no "sobre-exige" leyendo el campo equivocado en
    // sentido contrario: un admin de esta empresa que por casualidad es
    // vendedor en otra no debe quedar atrapado por error.
    const { guard, query } = buildGuard('crear_producto', 'admin', []);
    const ctx = buildCtx({ id: CAJERO, role: 'vendedor', empresaId: EMPRESA });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('sin fila en usuario_empresa para esta empresa (membresía inexistente/inactiva) → pasa, fail-open (no es este guard el que controla acceso a la empresa)', async () => {
    const { guard, query } = buildGuard('crear_producto', null, []);
    const ctx = buildCtx({ id: CAJERO, role: 'vendedor', empresaId: EMPRESA });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('clave desmarcada (requerido=false) → pasa, sin más chequeos', async () => {
    const { guard, query } = buildGuard('crear_producto', 'vendedor', [[{ requerido: false, modo: 'sesion' }]]);
    const ctx = buildCtx({ id: CAJERO, role: 'admin', empresaId: EMPRESA });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(query).toHaveBeenCalledTimes(2); // rol + política
  });

  it('clave marcada (modo sesión), sin sesión activa → 403', async () => {
    const { guard } = buildGuard('crear_producto', 'vendedor', [[{ requerido: true, modo: 'sesion' }], []]);
    const ctx = buildCtx({ id: CAJERO, role: 'admin', empresaId: EMPRESA });
    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });

  it('clave marcada (modo sesión), CON sesión activa → pasa', async () => {
    const { guard } = buildGuard('crear_producto', 'vendedor', [[{ requerido: true, modo: 'sesion' }], [{ id: 1 }]]);
    const ctx = buildCtx({ id: CAJERO, role: 'admin', empresaId: EMPRESA });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('clave marcada (modo cada_vez), sin header de token → 403, nunca consulta la BD para el token', async () => {
    const { guard, query } = buildGuard('cerrar_caja', 'vendedor', [[{ requerido: true, modo: 'cada_vez' }]]);
    const ctx = buildCtx({ id: CAJERO, role: 'admin', empresaId: EMPRESA });
    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
    expect(query).toHaveBeenCalledTimes(2); // rol + política, nunca intenta consumir un token inexistente
  });

  it('clave marcada (modo cada_vez), con token que no consume fila (vencido/usado/ajeno) → 403', async () => {
    const { guard } = buildGuard('cerrar_caja', 'vendedor', [[{ requerido: true, modo: 'cada_vez' }], []]);
    const ctx = buildCtx({ id: CAJERO, role: 'admin', empresaId: EMPRESA }, {}, { 'x-supervisor-token': 'tok1' });
    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });

  it('clave marcada (modo cada_vez), con token válido → pasa', async () => {
    const { guard } = buildGuard('cerrar_caja', 'vendedor', [[{ requerido: true, modo: 'cada_vez' }], [{ id: 1 }]]);
    const ctx = buildCtx({ id: CAJERO, role: 'admin', empresaId: EMPRESA }, {}, { 'x-supervisor-token': 'tok1' });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('sin fila en supervisor_politicas (empresa nunca migrada) → usa el default del catálogo', async () => {
    // 'crear_producto' por defecto es requerido=true en el catálogo.
    const { guard } = buildGuard('crear_producto', 'vendedor', [[], []]);
    const ctx = buildCtx({ id: CAJERO, role: 'admin', empresaId: EMPRESA });
    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });

  it('clave no catalogada → pasa siempre (bug de programación, no una política real)', async () => {
    const { guard, query } = buildGuard('clave-que-no-existe', 'vendedor', []);
    const ctx = buildCtx({ id: CAJERO, role: 'admin', empresaId: EMPRESA });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    // El catálogo es un array en memoria (CATALOGO_SUPERVISOR) — buscar ahí
    // no consulta la BD, así que la única query sigue siendo la del rol.
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('soloSi: cuando la condición no aplica, pasa sin consultar la política', async () => {
    const { guard, query } = buildGuard('anular_documento', 'vendedor', [], { soloSi: b => b?.estado === 'cancelada' });
    const ctx = buildCtx({ id: CAJERO, role: 'admin', empresaId: EMPRESA }, { estado: 'emitida' });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(query).toHaveBeenCalledTimes(1); // solo el lookup de rol — soloSi corta ANTES de la política
  });

  it('sin empresaId en el usuario → pasa (nada que resolver sin contexto de empresa)', async () => {
    const { guard, query } = buildGuard('crear_producto', 'vendedor', []);
    const ctx = buildCtx({ id: CAJERO, role: 'vendedor', empresaId: null });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(query).not.toHaveBeenCalled(); // corta antes de intentar ningún lookup
  });

  it('cache tibio (RolesGuard ya resolvió la membresía en esta misma request): usa el cache, no repite la consulta de rol', async () => {
    const GuardClass = RequiereSupervisor('crear_producto');
    // La PRIMERA respuesta de ds.query es para la política (requerido=true,
    // sesión) — el lookup de ROL no debería llegar a ds.query en absoluto,
    // porque el cache ya lo tiene.
    const ds = { query: jest.fn().mockResolvedValueOnce([{ requerido: true, modo: 'sesion' }]).mockResolvedValueOnce([]) };
    const cacheManager = {
      get: jest.fn().mockResolvedValue({ activo: true, rol: 'vendedor' }),
      set: jest.fn(),
    };
    const guard = new (GuardClass as any)(ds, cacheManager);
    const ctx = buildCtx({ id: CAJERO, role: 'admin', empresaId: EMPRESA });

    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException); // requerido, sin sesión activa
    expect(cacheManager.get).toHaveBeenCalledWith('membresia:10:7');
    expect(ds.query).toHaveBeenCalledTimes(2); // política + chequeo de sesión — NUNCA el lookup de rol
  });
});
