import { Injectable, CanActivate, ExecutionContext, UnauthorizedException, Inject } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { UserRole } from '../../users/enums/user-role.enum';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { User } from '../../users/users.entity';

const CACHE_TTL_MS = 30; // segundos

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

    // Usar el rol de BD (fuente de verdad), no el del JWT
    // super_admin tiene acceso irrestricto — pasa cualquier @Roles()
    if (dbRole === UserRole.SUPER_ADMIN) return true;
    return requiredRoles.some((role) => dbRole === role);
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
}

/** Invalida la entrada de caché para un usuario (llamar al cambiar el rol). */
export async function invalidateRoleCache(cacheManager: any, userId: number): Promise<void> {
  await cacheManager.del(`role:${userId}`);
}
