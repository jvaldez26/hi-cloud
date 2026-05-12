import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../../users/users.service';

export interface JwtPayload {
  sub:        number;
  email:      string;
  role:       string;
  empresaId?: number | null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private static readonly logger = new Logger(JwtStrategy.name);

  constructor(
    private configService: ConfigService,
    private usersService:  UsersService,
  ) {
    const secret = configService.get<string>('JWT_SECRET');
    if (!secret) {
      JwtStrategy.logger.error('JWT_SECRET no está definido en las variables de entorno');
      throw new Error('JWT_SECRET es requerido para iniciar el servidor');
    }
    super({
      jwtFromRequest:   ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey:      secret,
    });
  }

  async validate(payload: JwtPayload) {
    let user: Awaited<ReturnType<typeof this.usersService.findById>> | null = null;
    try {
      user = await this.usersService.findById(payload.sub);
    } catch {
      throw new UnauthorizedException('Token inválido o usuario inactivo');
    }
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Token inválido o usuario inactivo');
    }
    (user as any).empresaId = payload.empresaId ?? null;
    return user;
  }
}
