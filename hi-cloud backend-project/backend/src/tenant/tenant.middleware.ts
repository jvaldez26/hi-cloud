import { Injectable, NestMiddleware, ForbiddenException, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TenantService } from './tenant.service';
import { UsuarioEmpresa } from '../multi-empresa/entities/usuario-empresa.entity';
import { Empresa } from '../configuracion/entities/empresa.entity';
import { UserRole } from '../users/enums/user-role.enum';
import { extractJwtFromRequest } from '../auth/utils/extract-jwt.util';

/** Prefijo global del API (main.ts: app.setGlobalPrefix('api/v1')). */
const GLOBAL_PREFIX = '/api/v1';

/**
 * Rutas que NO requieren contexto de empresa.
 *
 * S-63: se comparan ANCLADAS AL INICIO del path (tras quitar el prefijo global),
 * no con `includes`. Con `includes`, cualquier ruta que contuviera uno de estos
 * fragmentos en cualquier posición se saltaba el middleware: por ejemplo
 * `GET /auditoria/modulo/admin` — un parámetro de ruta con el valor "admin" —
 * dejaba el request sin empresaId y la auditoría respondía con los logs de TODAS
 * las empresas.
 */
const RUTAS_SIN_TENANT = [
  '/auth/',
  '/admin/',              // Super Admin — acceso global sin tenant
  '/admin',
  '/health',
  '/api-json',
  '/api-yaml',
  '/portal/',
  '/invitacion/',
  '/invitaciones/aceptar',
  '/encuestas/responder',
  '/datafono',
  '/encuestas',
  '/capacitacion',
  '/demo/',
  '/demo',
  // Endpoints de usuario — listan empresas del usuario, no son tenant-específicos
  '/multi-empresa/mis-empresas',
  '/multi-empresa/empresa-principal',
];

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  private readonly logger = new Logger(TenantMiddleware.name);

  /**
   * Mapa de throttle para lastActivityAt: sessionToken → timestamp del último UPDATE.
   *
   * NOTA PM2/cluster: PM2 reinicia en cada deploy (~176 deploys) y borra este mapa,
   * causando un UPDATE extra por sesión activa post-deploy. Comportamiento aceptable.
   * En modo cluster (múltiples procesos PM2) el mapa es por proceso → más UPDATEs,
   * también aceptable. Si se mueve a cluster en el futuro, considerar Redis para el throttle.
   */
  private readonly activityThrottle = new Map<string, number>();
  private readonly ACTIVITY_THROTTLE_MS = 5 * 60 * 1000; // 5 minutos

  constructor(
    private readonly tenantSvc: TenantService,
    private readonly jwtSvc: JwtService,
    private readonly config: ConfigService,
    @InjectRepository(UsuarioEmpresa)
    private readonly ueRepo: Repository<UsuarioEmpresa>,
    @InjectRepository(Empresa)
    private readonly empresaRepo: Repository<Empresa>,
  ) {}

  /**
   * S-63: ¿el path está exento de contexto de empresa?
   *
   * Compara anclando al inicio: el path debe ser exactamente una ruta exenta o
   * colgar de ella (`/auth` o `/auth/...`, nunca `/x/auth`). Estático y público
   * para poder cubrirlo con tests sin instanciar el middleware.
   */
  static esRutaSinTenant(path: string): boolean {
    const rel = path.startsWith(GLOBAL_PREFIX)
      ? (path.slice(GLOBAL_PREFIX.length) || '/')
      : path;

    // Excepción: /portal/admin/* requiere auth y contexto de tenant.
    if (rel === '/portal/admin' || rel.startsWith('/portal/admin/')) return false;

    return RUTAS_SIN_TENANT.some(ruta => {
      const base = ruta.endsWith('/') ? ruta.slice(0, -1) : ruta;
      return rel === base || rel.startsWith(`${base}/`);
    });
  }

  async use(req: Request & { empresaId?: number; cookies?: Record<string, string> }, _res: Response, next: NextFunction) {
    const path = req.path;

    // Skip tenant validation for public/system routes.
    if (TenantMiddleware.esRutaSinTenant(path)) {
      return next();
    }

    // Usa el util centralizado — misma lógica que JwtStrategy y SuperAdminGuard
    const token = extractJwtFromRequest(req as Request);
    if (!token) return next();

    try {
      const secret  = this.config.get<string>('JWT_SECRET');
      const payload = this.jwtSvc.verify<{
        sub: number; role: string; empresaId?: number;
        sucursalId?: number; almacenId?: number; sessionToken?: string;
      }>(token, { secret });

      const userId   = payload.sub;
      const userRole = payload.role;

      // empresaId comes ONLY from the JWT payload — never from headers
      const empresaId = payload.empresaId ?? null;

      if (!empresaId || isNaN(empresaId)) {
        // No empresaId — let the guard handle enforcement per-route
        return next();
      }

      // ── 1. VERIFICAR QUE LA EMPRESA ESTÉ ACTIVA (no suspendida) ─────────────
      // Aplica a todos los roles — incluyendo admin.
      // Una empresa suspendida por el super_admin no tiene acceso a ningún recurso.
      const empresa = await this.empresaRepo.findOne({ where: { id: empresaId } });
      if (!empresa) {
        throw new ForbiddenException('Empresa no encontrada.');
      }
      if (!empresa.isActive) {
        throw new ForbiddenException(
          'Esta empresa ha sido suspendida. Contacte al administrador de la plataforma HiCloud.',
        );
      }

      // ── 2. VERIFICAR QUE EL USUARIO TIENE ACCESO A ESTA EMPRESA ──────────
      if (userRole !== UserRole.ADMIN && userRole !== UserRole.SUPER_ADMIN) {
        const acceso = await this.ueRepo.findOne({
          where: { userId, empresaId, isActive: true },
        });
        if (!acceso) {
          throw new ForbiddenException(`Sin acceso a la empresa #${empresaId}`);
        }
        this.tenantSvc.setRolEmpresa(acceso.rol);
      } else {
        this.tenantSvc.setRolEmpresa(UserRole.ADMIN);
      }

      this.tenantSvc.setEmpresaId(empresaId);
      this.tenantSvc.setUserId(userId);
      req.empresaId = empresaId;

      if (payload.sucursalId) this.tenantSvc.setSucursalId(payload.sucursalId);
      if (payload.almacenId)  this.tenantSvc.setAlmacenId(payload.almacenId);

      // Actualizar lastActivityAt con throttle de 5 min (fire-and-forget, no bloquea el request)
      if (payload.sessionToken) this.actualizarActivity(userId, payload.sessionToken);

    } catch (err) {
      if (err instanceof ForbiddenException) return next(err);
      // JWT errors — auth guard handles
    }

    next();
  }

  /**
   * Actualiza lastActivityAt del refresh token activo del usuario (fire-and-forget).
   * Usa EntityManager directo — sin importar AuthModule, sin dependencia circular.
   * Throttle de 5 min por sessionToken: evita un UPDATE por cada request HTTP.
   */
  private actualizarActivity(userId: number, sessionToken: string): void {
    const now  = Date.now();
    const last = this.activityThrottle.get(sessionToken) ?? 0;
    if (now - last < this.ACTIVITY_THROTTLE_MS) return;

    this.activityThrottle.set(sessionToken, now);

    this.empresaRepo.manager.query(
      `UPDATE refresh_tokens SET "lastActivityAt" = NOW()
       WHERE "userId" = $1 AND "revokedAt" IS NULL AND "expiresAt" > NOW()`,
      [userId],
    ).catch(() => {
      // Error no crítico — borramos para reintentar en el siguiente request
      this.activityThrottle.delete(sessionToken);
    });
  }
}
