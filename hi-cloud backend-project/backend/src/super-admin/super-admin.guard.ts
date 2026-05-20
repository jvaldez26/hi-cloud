import { Injectable, CanActivate, ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { UserRole } from '../users/enums/user-role.enum';
import { extractJwtFromRequest } from '../auth/utils/extract-jwt.util';

@Injectable()
export class SuperAdminGuard implements CanActivate {
  constructor(
    private jwtService:    JwtService,
    private configService: ConfigService,
    @InjectDataSource() private ds: DataSource,
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

    if (payload.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Acceso restringido a Super Administradores');
    }

    // S-32: verificar rol en BD — el JWT puede estar stale si el rol cambió
    const rows = await this.ds.query<{ role: string; isActive: boolean }[]>(
      `SELECT role, "isActive" FROM users WHERE id = $1 LIMIT 1`,
      [payload.sub],
    );
    const dbUser = rows[0];
    if (!dbUser || !dbUser.isActive || dbUser.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Acceso restringido a Super Administradores');
    }

    req.user = payload;
    return true;
  }
}
