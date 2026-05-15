import { ForbiddenException } from '@nestjs/common';

/**
 * Se lanza cuando se intenta ejecutar una query sobre una entidad @TenantScoped
 * sin que haya un empresaId en el contexto CLS actual.
 *
 * NUNCA debe caerse silenciosamente a '1=1'. Falla ruidosa, siempre.
 */
export class TenantContextMissingException extends ForbiddenException {
  constructor(entityName: string, context?: string) {
    super(
      `[TenantScope] Query sobre entidad @TenantScoped "${entityName}" sin contexto de empresa` +
      (context ? ` (${context})` : '') +
      `. Si es intencional (cron job, super admin, login), usa:\n` +
      `  - tenantService.runWithoutScope("razón", fn)  → query puntual\n` +
      `  - tenantService.runAs(empresaId, fn)           → actuar como una empresa\n` +
      `  - @SkipTenantScope() en el método             → método completo`,
    );
  }
}
