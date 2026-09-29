import { ForbiddenException } from '@nestjs/common';
import { AuditoriaAccessGuard } from './auditoria-access.guard';

/**
 * AuditoriaAccessGuard — SUPER_ADMIN y ADMIN siempre pasan; CONTADOR solo si
 * empresa.contadorPuedeVerAuditoria está en true. Corre DESPUÉS de
 * RolesGuard en la misma lista de @UseGuards(), así que cualquier otro rol
 * ya fue bloqueado antes de llegar aquí — este guard nunca lo decide.
 */
function ctxCon(usuario: { id?: number; role?: string; empresaId?: number } | undefined) {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user: usuario }) }),
  } as any;
}

function fakeDs(membresiaRol: string | undefined, contadorPuedeVerAuditoria: boolean | undefined) {
  const query = jest.fn(async (sql: string) => {
    if (sql.includes('usuario_empresa')) {
      return membresiaRol ? [{ rol: membresiaRol }] : [];
    }
    if (sql.includes('FROM empresa')) {
      return contadorPuedeVerAuditoria === undefined ? [] : [{ contadorPuedeVerAuditoria }];
    }
    return [];
  });
  return { query };
}

describe('AuditoriaAccessGuard', () => {
  it('ADMIN siempre pasa — ni siquiera consulta la empresa', async () => {
    const ds = fakeDs('admin', false); // aunque el flag esté apagado
    const guard = new AuditoriaAccessGuard(ds as any);
    const ctx = ctxCon({ id: 1, role: 'admin', empresaId: 7 });

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('SUPER_ADMIN siempre pasa', async () => {
    const ds = fakeDs('super_admin', false);
    const guard = new AuditoriaAccessGuard(ds as any);
    const ctx = ctxCon({ id: 1, role: 'super_admin', empresaId: 7 });

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('CONTADOR con el ajuste ENCENDIDO: pasa', async () => {
    const ds = fakeDs('contador', true);
    const guard = new AuditoriaAccessGuard(ds as any);
    const ctx = ctxCon({ id: 5, role: 'contador', empresaId: 7 });

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('CONTADOR con el ajuste APAGADO: 403 — este es el "contador sin acceso" del pedido', async () => {
    const ds = fakeDs('contador', false);
    const guard = new AuditoriaAccessGuard(ds as any);
    const ctx = ctxCon({ id: 5, role: 'contador', empresaId: 7 });

    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });

  it('CONTADOR sin fila en empresa (dato corrupto/columna ausente): trata como apagado, 403 — nunca abre por defecto', async () => {
    const ds = fakeDs('contador', undefined);
    const guard = new AuditoriaAccessGuard(ds as any);
    const ctx = ctxCon({ id: 5, role: 'contador', empresaId: 7 });

    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });

  it('CONTADOR sin empresaId en el request: 403 explícito, no revienta con SQL a null', async () => {
    const ds = fakeDs(undefined, true);
    const guard = new AuditoriaAccessGuard(ds as any);
    const ctx = ctxCon({ id: 5, role: 'contador', empresaId: undefined });

    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });

  it('rol EFECTIVO en la empresa activa manda sobre el rol del JWT (caso multi-empresa)', async () => {
    // El JWT dice "admin" (rol en la empresa principal) pero en ESTA empresa
    // activa el usuario es contador — y el ajuste está apagado ahí.
    const ds = fakeDs('contador', false);
    const guard = new AuditoriaAccessGuard(ds as any);
    const ctx = ctxCon({ id: 5, role: 'admin', empresaId: 9 });

    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });

  it('otro rol (ej. vendedor) que llegara hasta aquí: no es este guard quien lo bloquea — deja pasar', async () => {
    const ds = fakeDs('vendedor', false);
    const guard = new AuditoriaAccessGuard(ds as any);
    const ctx = ctxCon({ id: 5, role: 'vendedor', empresaId: 7 });

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('sin usuario en el request: rechaza', async () => {
    const guard = new AuditoriaAccessGuard(fakeDs(undefined, undefined) as any);
    await expect(guard.canActivate(ctxCon(undefined))).resolves.toBe(false);
  });
});
