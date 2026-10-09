import {
  Injectable, CanActivate, ExecutionContext,
  ForbiddenException, mixin, Type, Inject,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Request } from 'express';
import { User } from '../../users/users.entity';
import { CATALOGO_SUPERVISOR } from '../supervisor-catalogo';
import { membresiaCacheKey } from '../../auth/guards/roles.guard';

/**
 * Reemplaza a SupervisorGateGuard: en vez de exigir supervisor SIEMPRE que
 * el rol sea vendedor, consulta la política de la empresa para `clave` —
 * si no está marcada como requerida, no exige nada (antes el guard genérico
 * no tenía forma de "apagarse" por empresa).
 *
 * ADMIN/CONTADOR/SUPER_ADMIN pasan siempre, igual que antes.
 *
 * No depende de un servicio inyectado a propósito (mismo motivo que
 * SupervisorGateGuard: evita agregar SupervisorPoliticasModule a los
 * imports de cada módulo consumidor) — usa DataSource directo, ya
 * disponible globalmente vía TypeOrmModule.
 *
 * El token de un solo uso (modo 'cada_vez') viaja en el header
 * `x-supervisor-token`, emitido por POST /auth/verificar-supervisor cuando
 * el body incluye `clave`.
 *
 * `soloSi`: igual que en SupervisorGateGuard — para endpoints que manejan
 * varias transiciones bajo la misma ruta.
 *
 * Bug real (2026-10-09, encontrado vía Cierre de Caja — empresa de Samuel):
 * este guard comparaba contra `user.role`, la columna GLOBAL de `users` —
 * que solo se mantiene sincronizada con la empresa PRINCIPAL del usuario
 * (ver el mismo comentario en roles.guard.ts, `cambiarRolUsuario` en
 * multi-empresa.service.ts). Un cajero VENDEDOR en una empresa secundaria
 * cuyo rol global fuera otro (admin/contador en su empresa principal)
 * pasaba CUALQUIER política de este guard sin que se le pidiera nunca
 * autorización — afectaba las ~20 políticas del catálogo, no solo caja.
 * Ahora resuelve el rol de la empresa ACTIVA vía `usuario_empresa`,
 * reutilizando el mismo cache de 30s que RolesGuard.checkMembresia ya
 * pobló para esta misma request (mismo CACHE_MANAGER, misma clave).
 *
 * El 403 por falta de autorización lleva `supervisorClaveRequerida` y
 * `supervisorModo` en el body — el interceptor de axios del frontend
 * (api/client.ts) los lee para pedir la autorización que haga falta y
 * reintentar la MISMA petición una vez, sin que cada pantalla tenga que
 * cablear su propio gate por clave (ver sessionEvents.ts /
 * ReautenticacionGlobalModal, mismo patrón ya usado para el 401 de JWT).
 */
export const RequiereSupervisor = (clave: string, opts?: { soloSi?: (body: any) => boolean }): Type<CanActivate> => {
  @Injectable()
  class RequiereSupervisorMixin implements CanActivate {
    constructor(
      readonly ds: DataSource,
      @Inject(CACHE_MANAGER) private readonly cacheManager: any,
    ) {}

    /** Mismo cache (30s) y misma fuente que RolesGuard.checkMembresia — si
     *  esta request ya pasó por RolesGuard (@Roles() a nivel de clase, que
     *  corre ANTES que este guard de método), el valor ya está en caché. */
    private async rolEnEmpresa(userId: number, empresaId: number): Promise<string | undefined> {
      const cacheKey = membresiaCacheKey(userId, empresaId);
      const cached = (await this.cacheManager.get(cacheKey)) as { activo: boolean; rol?: string } | undefined | null;
      if (cached !== undefined && cached !== null) return cached.rol;

      const [fila] = await this.ds.query<{ rol: string }[]>(`
        SELECT rol FROM usuario_empresa WHERE "userId" = $1 AND "empresaId" = $2 AND "isActive" = true LIMIT 1
      `, [userId, empresaId]);
      return fila?.rol;
    }

    async canActivate(ctx: ExecutionContext): Promise<boolean> {
      const req = ctx.switchToHttp().getRequest<Request & { user?: User }>();
      const user = req.user;
      if (!user) return true;

      const empresaId = (user as any).empresaId as number | null | undefined;
      if (!empresaId) return true; // sin empresa activa, ninguna política de empresa aplica

      const rol = await this.rolEnEmpresa(user.id, empresaId);
      if (rol !== 'vendedor') return true;
      if (opts?.soloSi && !opts.soloSi(req.body)) return true;

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
          // UPDATE...RETURNING envuelto en SELECT: .query() devuelve [rows,
          // rowCount] para un UPDATE crudo (nunca .length directo sobre eso —
          // ver feedback_typeorm_query_returning) — envolver en WITH...SELECT
          // lo vuelve un SELECT normal, sin ambigüedad.
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
          ? 'Esta acción requiere una autorización de supervisor nueva.'
          : 'Esta acción requiere modo supervisor activo — actívalo desde el Punto de Venta.',
        supervisorClaveRequerida: clave,
        supervisorModo: modo,
      });
    }
  }

  return mixin(RequiereSupervisorMixin);
};
