import {
  Injectable, CanActivate, ExecutionContext,
  ForbiddenException, mixin, Type,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { Request } from 'express';
import { User } from '../../users/users.entity';

/**
 * Exige una sesión de modo supervisor ACTIVA (ver useSupervisor.ts /
 * AuthService.verificarSupervisor) para que un VENDEDOR ejecute una acción
 * que ya está protegida por supervisor DENTRO del POS — pero que hoy, fuera
 * del POS (página standalone o llamada directa a la API), no tenía ninguna
 * autorización.
 *
 * ADMIN/CONTADOR/SUPER_ADMIN pasan siempre: ellos SON la autoridad que
 * aprueba, no necesitan aprobación de nadie más. Cualquier otro rol pasa
 * también SIN restricción nueva — este guard nunca resta acceso a un rol
 * que hoy no lo tuviera; solo le agrega una condición extra a VENDEDOR.
 *
 * No depende de AuthService a propósito (evita agregar `AuthModule` a los
 * imports de cada módulo consumidor — productos, inventario, notas-crédito,
 * recibos-cobro, gastos, facturas no lo importan hoy): usa DataSource
 * directo, mismo patrón que ModuloAddonGuard. La consulta es la MISMA que ya
 * usan FacturasService.resolverSupervisorSessionId y
 * AuthService.cerrarSesionSupervisor: "¿hay una fila de activación de este
 * cajero, sin cerrar, de las últimas 8h?" — ni siquiera necesita que el
 * cliente mande un `supervisorSessionId`: si el vendedor activó el modo en
 * el POS, la acción se permite sin importar desde qué pantalla la haga.
 *
 * `soloSi`: para endpoints que manejan varias transiciones bajo la misma
 * ruta (ej. PATCH /facturas/:id/estado también emite, no solo anula) —
 * cuando se pasa, el guard solo exige supervisor si `soloSi(body)` es true;
 * si no se pasa, exige supervisor siempre que el rol sea vendedor.
 */
export const SupervisorGateGuard = (opts?: { soloSi?: (body: any) => boolean }): Type<CanActivate> => {
  @Injectable()
  class SupervisorGateMixin implements CanActivate {
    constructor(readonly ds: DataSource) {}

    async canActivate(ctx: ExecutionContext): Promise<boolean> {
      const req = ctx.switchToHttp().getRequest<Request & { user?: User }>();
      const user = req.user;
      if (!user || (user as any).role !== 'vendedor') return true;

      if (opts?.soloSi && !opts.soloSi(req.body)) return true;

      const empresaId = (user as any).empresaId as number | null | undefined;
      if (!empresaId) {
        throw new ForbiddenException('Se requiere contexto de empresa activa.');
      }

      const [row] = await this.ds.query<{ id: number }[]>(`
        SELECT act.id
        FROM pos_supervisor_log act
        WHERE act."cajeroId" = $1 AND act."empresaId" = $2 AND act."sessionId" IS NULL
          AND act."createdAt" >= NOW() - INTERVAL '8 hours'
          AND NOT EXISTS (SELECT 1 FROM pos_supervisor_log c WHERE c."sessionId" = act.id)
        ORDER BY act."createdAt" DESC
        LIMIT 1
      `, [user.id, empresaId]);

      if (!row) {
        throw new ForbiddenException(
          'Esta acción requiere modo supervisor activo — actívalo desde el Punto de Venta.',
        );
      }
      return true;
    }
  }

  return mixin(SupervisorGateMixin);
};
