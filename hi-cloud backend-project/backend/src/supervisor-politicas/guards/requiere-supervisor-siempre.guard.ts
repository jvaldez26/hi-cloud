import {
  Injectable, CanActivate, ExecutionContext,
  ForbiddenException, mixin, Type, Inject,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Request } from 'express';
import { User } from '../../users/users.entity';
import { CATALOGO_SUPERVISOR } from '../supervisor-catalogo';

/**
 * Variante de RequiereSupervisor para las pocas acciones donde incluso un
 * ADMIN necesita la autorización de OTRA persona — RequiereSupervisor deja
 * pasar a ADMIN/CONTADOR siempre (es el diseño correcto para el 99% del
 * catálogo: ellos SON el supervisor del vendedor). Corregir la forma de
 * pago de una factura ya cobrada es distinto: quien corrige suele ser
 * ADMIN, y el pedido explícito es que la corrección quede respaldada por
 * un segundo usuario (otro ADMIN/CONTADOR), no solo por el rol de quien la
 * hace.
 *
 * Mismo mecanismo de bajo nivel que RequiereSupervisor (catálogo único,
 * token de un solo uso en `x-supervisor-token`, emitido por POST
 * /auth/verificar-supervisor) — la única diferencia es que aquí NO hay
 * bypass por rol.
 */
export const RequiereSupervisorSiempre = (clave: string): Type<CanActivate> => {
  @Injectable()
  class RequiereSupervisorSiempreMixin implements CanActivate {
    constructor(
      readonly ds: DataSource,
      @Inject(CACHE_MANAGER) private readonly cacheManager: any,
    ) {}

    async canActivate(ctx: ExecutionContext): Promise<boolean> {
      const req = ctx.switchToHttp().getRequest<Request & { user?: User }>();
      const user = req.user;
      if (!user) return true;

      const empresaId = (user as any).empresaId as number | null | undefined;
      if (!empresaId) return true;

      const item = CATALOGO_SUPERVISOR.find(c => c.clave === clave);
      if (!item) return true; // clave no catalogada → nunca bloquea (bug de programación, no de política)

      const [fila] = await this.ds.query<{ requerido: boolean; modo: string }[]>(`
        SELECT requerido, modo FROM supervisor_politicas WHERE "empresaId" = $1 AND clave = $2
      `, [empresaId, clave]);
      const requerido = fila?.requerido ?? item.defaultRequerido;
      const modo      = fila?.modo      ?? item.defaultModo;
      if (!requerido) return true;

      if (modo === 'sesion') {
        const [row] = await this.ds.query<{ id: number }[]>(`
          SELECT act.id
          FROM pos_supervisor_log act
          WHERE act."cajeroId" = $1 AND act."empresaId" = $2 AND act."sessionId" IS NULL
            AND act."createdAt" >= NOW() - INTERVAL '8 hours'
            AND NOT EXISTS (SELECT 1 FROM pos_supervisor_log c WHERE c."sessionId" = act.id)
          ORDER BY act."createdAt" DESC
          LIMIT 1
        `, [user.id, empresaId]);
        if (row) return true;
      } else {
        const token = req.headers['x-supervisor-token'] as string | undefined;
        if (token) {
          const consumidos = await this.ds.query(`
            WITH fila AS (
              UPDATE supervisor_autorizaciones SET usado = true
              WHERE token = $1 AND "empresaId" = $2 AND "cajeroId" = $3 AND clave = $4
                AND usado = false AND "expiraEn" > NOW()
              RETURNING id
            ) SELECT * FROM fila
          `, [token, empresaId, user.id, clave]);
          if (consumidos.length) return true;
        }
      }

      throw new ForbiddenException({
        message: modo === 'cada_vez'
          ? 'Esta acción requiere la autorización de otro ADMIN o CONTADOR.'
          : 'Esta acción requiere modo supervisor activo.',
        supervisorClaveRequerida: clave,
        supervisorModo: modo,
      });
    }
  }

  return mixin(RequiereSupervisorSiempreMixin);
};
