import {
  Injectable, CanActivate, ExecutionContext, ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

export const SKIP_TENANT_KEY = 'skipTenantGuard';

/**
 * Guard que verifica que el header X-Empresa-ID esté presente en cada request.
 * Previene que una petición sin empresa acceda a datos multi-tenant.
 *
 * Se puede saltear con @SkipTenantGuard() en rutas públicas.
 */
@Injectable()
export class TenantRequiredGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_TENANT_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (skip) return true;

    const request = ctx.switchToHttp().getRequest();
    const empresaId =
      request.headers['x-empresa-id'] ??
      request.user?.empresaId;

    if (!empresaId || Number(empresaId) === 0) {
      throw new ForbiddenException(
        'Se requiere X-Empresa-ID para acceder a este recurso',
      );
    }

    return true;
  }
}
