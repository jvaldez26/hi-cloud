import { Injectable, CanActivate, ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UserRole } from '../users/enums/user-role.enum';

@Injectable()
export class SuperAdminGuard implements CanActivate {
  constructor(
    private jwtService:    JwtService,
    private configService: ConfigService,
  ) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    const auth = req.headers.authorization;
    if (!auth?.startsWith('Bearer ')) throw new UnauthorizedException('Token requerido');

    try {
      const payload = this.jwtService.verify(auth.slice(7), {
        secret: this.configService.get<string>('JWT_SECRET'),
      });
      if (payload.role !== UserRole.SUPER_ADMIN) {
        throw new ForbiddenException('Acceso restringido a Super Administradores');
      }
      req.user = payload;
      return true;
    } catch (err: any) {
      if (err instanceof ForbiddenException) throw err;
      throw new UnauthorizedException('Token inválido o expirado');
    }
  }
}
