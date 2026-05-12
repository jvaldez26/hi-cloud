import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Extrae el empresaId del JWT o del header X-Empresa-ID.
 * Uso: @EmpresaActual() empresaId: number
 */
export const EmpresaActual = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): number | undefined => {
    const req = ctx.switchToHttp().getRequest<{
      user?: { empresaId?: number };
      headers: Record<string, string>;
    }>();

    const headerEmpresaId = req.headers['x-empresa-id'];
    if (headerEmpresaId) return Number(headerEmpresaId);
    return req.user?.empresaId;
  },
);
