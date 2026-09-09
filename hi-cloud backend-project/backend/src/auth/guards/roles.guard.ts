import { Injectable, CanActivate, ExecutionContext, UnauthorizedException, Inject } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { UserRole } from '../../users/enums/user-role.enum';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { User } from '../../users/users.entity';

const CACHE_TTL_MS = 30; // segundos

/** Clave de cache para membresía activa en empresa (B-03). */
export function membresiaCacheKey(userId: number, empresaId: number) {
  return `membresia:${userId}:${empresaId}`;
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private reflector:           Reflector,
    @InjectDataSource() private ds: DataSource,
    @Inject(CACHE_MANAGER) private cacheManager: any,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) return true;

    const { user } = context.switchToHttp().getRequest<{ user: User & { roleVersion?: number } }>();
    if (!user) return false;

    // S-31: verificar que la versión de rol del JWT coincide con la BD
    const tokenRoleVersion = (user as any).roleVersion ?? 1;
    const { version: dbVersion, role: dbRole } = await this.getCachedRoleInfo(user.id);

    if (dbVersion !== tokenRoleVersion) {
      // El rol cambió después de emitir este token — forzar re-login
      throw new UnauthorizedException({
        code: 'ROLE_CHANGED',
        message: 'Tu sesión necesita actualizarse. Por favor inicia sesión de nuevo.',
      });
    }

    // B-03: verificar membresía activa en la empresa del JWT (con cache 30s)
    //
    // El rol contra el que se autoriza es el de `usuario_empresa` para ESA
    // empresa, no el global de `users`: `users.role` solo se mantiene
    // sincronizado con la empresa PRINCIPAL del usuario (ver
    // `cambiarRolUsuario` en multi-empresa.service.ts), así que un usuario
    // admin en una empresa secundaria y contador en la principal quedaba
    // bloqueado (403 "Forbidden resource") en cualquier mutación de esa
    // empresa secundaria — y, al revés, un admin global solo viewer en una
    // empresa secundaria pasaba como admin ahí. `users.role` sigue siendo el
    // que decide fuera de un contexto de empresa (rutas de super admin).
    const empresaId = (user as any).empresaId as number | null | undefined;
    let effRole = dbRole;
    if (empresaId) {
      const membresia = await this.checkMembresia(user.id, empresaId);
      if (!membresia.activo) throw new UnauthorizedException('Sin acceso a esta empresa');
      if (membresia.rol) effRole = membresia.rol;
    }

    // super_admin tiene acceso irrestricto — pasa cualquier @Roles()
    if (dbRole === UserRole.SUPER_ADMIN) return true;
    return requiredRoles.some((role) => effRole === role);
  }

  private async getCachedRoleInfo(userId: number): Promise<{ version: number; role: string }> {
    // M-03: usar CACHE_MANAGER (Redis en prod, in-memory en dev) en lugar de
    // Map local — correcto en despliegues multi-instancia PM2
    const cacheKey = `role:${userId}`;
    const cached = (await this.cacheManager.get(cacheKey)) as { version: number; role: string } | undefined;
    if (cached) return cached;

    const rows = await this.ds.query<{ role: string; roleVersion: number }[]>(
      `SELECT role, "roleVersion" FROM users WHERE id = $1 AND "isActive" = true LIMIT 1`,
      [userId],
    );

    if (!rows[0]) return { version: 0, role: '' };

    const data = { version: rows[0].roleVersion ?? 1, role: rows[0].role };
    await this.cacheManager.set(cacheKey, data, CACHE_TTL_MS);
    return data;
  }

  private async checkMembresia(userId: number, empresaId: number): Promise<{ activo: boolean; rol?: string }> {
    // B-03: validar que el usuario sigue siendo miembro activo de la empresa,
    // y de paso traer su rol EN ESA EMPRESA — es lo que autoriza el @Roles()
    // de cualquier ruta con contexto de empresa (ver canActivate).
    const cacheKey = membresiaCacheKey(userId, empresaId);
    const cached = (await this.cacheManager.get(cacheKey)) as { activo: boolean; rol?: string } | undefined | null;
    if (cached !== undefined && cached !== null) return cached;

    const rows = await this.ds.query<{ rol: string }[]>(
      `SELECT rol FROM usuario_empresa WHERE "userId" = $1 AND "empresaId" = $2 AND "isActive" = true LIMIT 1`,
      [userId, empresaId],
    );
    const data = rows.length > 0 ? { activo: true, rol: rows[0].rol } : { activo: false };
    await this.cacheManager.set(cacheKey, data, CACHE_TTL_MS);
    return data;
  }
}

/** Invalida la entrada de caché de rol para un usuario (llamar al cambiar el rol). */
export async function invalidateRoleCache(cacheManager: any, userId: number): Promise<void> {
  await cacheManager.del(`role:${userId}`);
}

/** Invalida la entrada de caché de membresía (llamar al remover usuario de empresa). */
export async function invalidateMembresiaCache(cacheManager: any, userId: number, empresaId: number): Promise<void> {
  await cacheManager.del(membresiaCacheKey(userId, empresaId));
}
