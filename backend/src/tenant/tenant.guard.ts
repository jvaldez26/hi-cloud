import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { TenantService } from './tenant.service';

/**
 * Guard que garantiza que el request tiene un contexto de empresa válido.
 * Úsalo en controllers que requieren aislamiento de datos.
 */
@Injectable()
export class TenantGuard implements CanActivate {
  constructor(private readonly tenantSvc: TenantService) {}

  canActivate(context: ExecutionContext): boolean {
    const empresaId = this.tenantSvc.getEmpresaIdOrNull();
    if (!empresaId) {
      throw new ForbiddenException(
        'Se requiere el header X-Empresa-ID para acceder a este recurso.',
      );
    }
    return true;
  }
}
