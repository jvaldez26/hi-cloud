import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserRole } from '../../users/enums/user-role.enum';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { User } from '../../users/users.entity';

// S-31: cache en memoria con TTL 30s — evita ir a BD en cada request
// pero detecta cambios de rol en máx 30 segundos
interface CacheEntry { version: number; role: string; cachedAt: number }
const roleCache = new Map<number, CacheEntry>();
const CACHE_TTL = 30_000; // 30 segundos

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    @InjectRepository(User)
    private userRepo: Repository<User>,
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
      // El rol cambió después de emitir este token
      throw new UnauthorizedException({
        code: 'ROLE_CHANGED',
        message: 'Tu sesión necesita actualizarse. Por favor inicia sesión de nuevo.',
      });
    }

    // Usar el rol de BD (fuente de verdad), no el del JWT
    return requiredRoles.some((role) => dbRole === role);
  }

  private async getCachedRoleInfo(userId: number): Promise<{ version: number; role: string }> {
    const cached = roleCache.get(userId);
    if (cached && Date.now() - cached.cachedAt < CACHE_TTL) {
      return { version: cached.version, role: cached.role };
    }

    const user = await this.userRepo.findOne({
      where: { id: userId, isActive: true },
      select: ['id', 'role', 'roleVersion'] as any,
    });

    if (!user) return { version: 0, role: '' };

    const entry: CacheEntry = {
      version:  (user as any).roleVersion ?? 1,
      role:     user.role,
      cachedAt: Date.now(),
    };
    roleCache.set(userId, entry);
    return { version: entry.version, role: entry.role };
  }
}

/** Invalida la entrada de caché para un usuario (llamar al cambiar el rol). */
export function invalidateRoleCache(userId: number): void {
  roleCache.delete(userId);
}
