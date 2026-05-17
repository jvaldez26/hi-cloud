import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../../users/users.service';
import { TokenBlacklistService } from '../token-blacklist.service';
import type { Request } from 'express';
import { extractJwtFromRequest } from '../utils/extract-jwt.util';

export interface JwtPayload {
  sub:           number;
  email:         string;
  role:          string;
  empresaId?:    number | null;
  jti?:          string;         // S-27: JWT ID para blacklist
  exp?:          number;
  roleVersion?:  number;         // S-31: versión de rol para invalidación rápida
  sessionToken?: string;         // Control de sesión única por usuario
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private static readonly logger = new Logger(JwtStrategy.name);

  constructor(
    private configService:    ConfigService,
    private usersService:     UsersService,
    private blacklistService: TokenBlacklistService,
  ) {
    const secret = configService.get<string>('JWT_SECRET');
    if (!secret) {
      JwtStrategy.logger.error('JWT_SECRET no está definido en las variables de entorno');
      throw new Error('JWT_SECRET es requerido para iniciar el servidor');
    }
    super({
      // Usa el util centralizado para extraer el JWT — misma lógica que TenantMiddleware
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req: Request) => extractJwtFromRequest(req),
      ]),
      ignoreExpiration: false,
      secretOrKey:      secret,
      passReqToCallback: false,
    });
  }

  async validate(payload: JwtPayload) {
    // S-27: verificar que el token no esté en la blacklist
    if (await this.blacklistService.isBlacklisted(payload.jti)) {
      throw new UnauthorizedException('Token revocado');
    }

    let user: Awaited<ReturnType<typeof this.usersService.findById>> | null = null;
    try {
      user = await this.usersService.findById(payload.sub);
    } catch {
      throw new UnauthorizedException('Token inválido o usuario inactivo');
    }
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Token inválido o usuario inactivo');
    }

    // Sesión desplazada: el usuario inició sesión desde otro dispositivo
    if (payload.sessionToken && user.sessionToken &&
        payload.sessionToken !== user.sessionToken) {
      throw new UnauthorizedException('SESION_DESPLAZADA');
    }

    (user as any).empresaId = payload.empresaId ?? null;
    (user as any).jti       = payload.jti;
    (user as any).exp       = payload.exp;
    return user;
  }
}
