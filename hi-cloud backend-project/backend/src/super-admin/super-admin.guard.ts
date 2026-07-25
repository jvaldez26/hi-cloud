import { Injectable, CanActivate, ExecutionContext, ForbiddenException, UnauthorizedException, Optional } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { UserRole } from '../users/enums/user-role.enum';
import { extractJwtFromRequest } from '../auth/utils/extract-jwt.util';
import { TokenBlacklistService } from '../auth/token-blacklist.service';

@Injectable()
export class SuperAdminGuard implements CanActivate {
  constructor(
    private jwtService:         JwtService,
    private configService:      ConfigService,
    private blacklistSvc:       TokenBlacklistService,
    // @Optional → permite instanciar sin DI container (tests unitarios)
    @Optional() @InjectDataSource() private ds: DataSource | null,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req   = ctx.switchToHttp().getRequest();
    const token = extractJwtFromRequest(req);
    if (!token) throw new UnauthorizedException('Token requerido');

    let payload: any;
    try {
      payload = this.jwtService.verify(token, {
        secret: this.configService.get<string>('JWT_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Token inválido o expirado');
    }

    // A-02: verificar que el JTI no ha sido revocado (logout previo)
    if (await this.blacklistSvc.isBlacklisted(payload.jti)) {
      throw new UnauthorizedException('Token revocado');
    }

    if (payload.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Acceso restringido a Super Administradores');
    }

    // S-32: verificar rol en BD — el JWT puede estar stale si el rol cambió.
    // Si no hay DataSource (test unitario sin DI), confiar solo en el JWT.
    if (this.ds) {
      const rows = await this.ds.query<{ role: string; isActive: boolean; twoFactorEnabled: boolean }[]>(
        `SELECT role, "isActive", "twoFactorEnabled" FROM users WHERE id = $1 LIMIT 1`,
        [payload.sub],
      );
      const dbUser = rows[0];
      if (!dbUser || !dbUser.isActive || dbUser.role !== UserRole.SUPER_ADMIN) {
        throw new ForbiddenException('Acceso restringido a Super Administradores');
      }

      // S-65: 2FA obligatoria para operar la plataforma.
      // Enrollment forzado, NO bloqueo de sesión: el login sigue funcionando y
      // /auth/2fa/* (JwtAuthGuard, fuera de este guard) queda accesible, así que
      // el super admin puede configurarla desde su propia sesión y desbloquear el
      // panel. Nadie se queda fuera, pero nadie opera sin segundo factor.
      if (!dbUser.twoFactorEnabled) {
        throw new ForbiddenException({
          code:    'SUPER_ADMIN_2FA_REQUERIDA',
          message: 'Debes configurar la verificación en dos pasos para usar el panel de administración.',
        });
      }
    }

    // Normalizar req.user para que @GetUser('id') funcione igual que con JwtAuthGuard
    // JwtStrategy.validate() devuelve una entidad User con `id`, pero aquí solo tenemos
    // el JWT payload que usa `sub`. Asignamos `id = sub` para compatibilidad.
    req.user = { ...payload, id: payload.sub };
    return true;
  }
}
