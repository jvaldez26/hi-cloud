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

/** Rutas que NO requieren X-Empresa-ID */
const RUTAS_SIN_TENANT = [
  '/auth/',
  '/admin/',          // Super Admin — acceso global sin tenant
  '/admin',           // GET /admin/*
  '/health',
  '/api-json',
  '/api-yaml',
  '/portal/',
  '/invitacion/',
  '/encuestas/responder',
  '/datafono',
  '/encuestas',
  '/capacitacion',
  '/demo/',           // Solicitud de demo — endpoint público de la landing page
  '/demo',
];

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  private readonly logger = new Logger(TenantMiddleware.name);

  constructor(
    private readonly tenantSvc: TenantService,
    private readonly jwtSvc: JwtService,
    private readonly config: ConfigService,
    @InjectRepository(UsuarioEmpresa)
    private readonly ueRepo: Repository<UsuarioEmpresa>,
    @InjectRepository(Empresa)
    private readonly empresaRepo: Repository<Empresa>,
  ) {}

  async use(req: Request & { empresaId?: number }, _res: Response, next: NextFunction) {
    const path = req.path;

    // Skip tenant validation for public/system routes
    if (RUTAS_SIN_TENANT.some(r => path.includes(r))) {
      return next();
    }

    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) return next();

    try {
      const token   = authHeader.slice(7);
      const secret  = this.config.get<string>('JWT_SECRET');
      const payload = this.jwtSvc.verify<{ sub: number; role: string; empresaId?: number }>(
        token,
        { secret },
      );

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

    } catch (err) {
      if (err instanceof ForbiddenException) return next(err);
      // JWT errors — auth guard handles
    }

    next();
  }
}
