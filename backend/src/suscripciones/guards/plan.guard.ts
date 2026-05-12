import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { LimitesService } from '../limites.service';
import { PLANES } from '../entities/suscripcion.entity';

export const MODULO_KEY = 'modulo_requerido';

@Injectable()
export class PlanGuard implements CanActivate {
  constructor(
    private readonly reflector:  Reflector,
    private readonly limitesSvc: LimitesService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const modulo = this.reflector.getAllAndOverride<string>(MODULO_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // Sin decorador → sin restricción
    if (!modulo) return true;

    const req = context.switchToHttp().getRequest<any>();

    // Obtener empresaId del request (seteado por TenantMiddleware) o del header
    const empresaId: number | null =
      req.empresaId ??
      (req.headers?.['x-empresa-id'] ? Number(req.headers['x-empresa-id']) : null);

    // Sin contexto de empresa (rutas públicas sin tenant) → permitir
    if (!empresaId || isNaN(empresaId)) return true;

    try {
      await this.limitesSvc.verificarModulo(empresaId, modulo);
      return true;
    } catch {
      const sus = await this.limitesSvc.getSuscripcion(empresaId);
      const cfg = PLANES[sus.plan];
      const nombre = cfg?.nombre ?? sus.plan;
      throw new ForbiddenException(
        `Tu plan ${nombre} no incluye el módulo "${modulo}". Actualiza tu plan para acceder.`,
      );
    }
  }
}
