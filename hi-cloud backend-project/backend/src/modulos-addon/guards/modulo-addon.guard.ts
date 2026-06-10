import {
  Injectable, CanActivate, ExecutionContext,
  ForbiddenException, mixin, Type, Logger,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { Request } from 'express';

export const ModuloAddonGuard = (codigo: string): Type<CanActivate> => {
  @Injectable()
  class ModuloAddonMixin implements CanActivate {
    private readonly logger = new Logger(`ModuloAddonGuard[${codigo}]`);

    constructor(readonly ds: DataSource) {}

    async canActivate(ctx: ExecutionContext): Promise<boolean> {
      const req = ctx.switchToHttp().getRequest<Request & { empresaId?: number }>();
      const empresaId = req.empresaId;
      if (!empresaId) throw new ForbiddenException('Empresa no identificada en el contexto');

      let rows: any[];
      try {
        rows = await this.ds.query<any[]>(
          `SELECT 1 FROM empresa_modulos
           WHERE "empresaId" = $1 AND "moduloCodigo" = $2
             AND activo = true
             AND ("fechaVencimiento" IS NULL OR "fechaVencimiento" > NOW())
           LIMIT 1`,
          [empresaId, codigo],
        );
      } catch (err: any) {
        this.logger.error(`Error verificando módulo '${codigo}' para empresa #${empresaId}: ${err.message}`, err.stack);
        throw err;
      }

      if (!rows.length) {
        throw new ForbiddenException(
          `El módulo '${codigo}' no está disponible para tu empresa. Contacta a soporte para activarlo.`,
        );
      }
      return true;
    }
  }

  return mixin(ModuloAddonMixin);
};
