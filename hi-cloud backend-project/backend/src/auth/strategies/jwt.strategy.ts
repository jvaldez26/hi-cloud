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
  sucursalId?:   number | null;
  almacenId?:    number | null;
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
      // ForAuth: necesitamos sessionToken para el guard de sesión única de más
      // abajo. Se borra del objeto antes de devolverlo (ver el final del método).
      user = await this.usersService.findByIdForAuth(payload.sub);
    } catch {
      throw new UnauthorizedException('Token inválido o usuario inactivo');
    }
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Token inválido o usuario inactivo');
    }

    // Bloquear cuentas pendientes de aprobación (defensa en profundidad)
    if ((user as any).accountStatus === 'pendiente') {
      throw new UnauthorizedException('CUENTA_PENDIENTE');
    }

    // Bloquear usuarios sin contraseña configurada (Google users antes de /setup-password)
    if ((user as any).passwordConfigured === false) {
      throw new UnauthorizedException('CONTRASEÑA_NO_CONFIGURADA');
    }

    // Sesión desplazada o revocada.
    //
    // El valor viene del `user` ya cargado por findById() arriba: `sessionToken`
    // es una columna normal de la entidad User (SIN `select: false`, a diferencia
    // de password/googleId/twoFactorSecret), así que findOne() la trae en el mismo
    // SELECT. La query cruda que había aquí leía la MISMA fila una segunda vez —
    // 2 SELECT a `users` por cada request autenticado del ERP.
    //
    // Tampoco había caché que evitar: findById() usa findOne() sin `cache: true`,
    // y TypeORM no cachea resultados salvo que se lo pidas explícitamente.
    //
    // CONTRATO: depende de que findByIdForAuth haga addSelect('u.sessionToken').
    // La columna es select:false, así que un findById normal lo deja undefined
    // → dbToken null → `!dbToken` lanza. FALLA CERRADO: no deja pasar sesiones
    // viejas en silencio, saca a TODO el mundo con 401 en el primer request.
    // Ruidoso e imposible de ignorar, pero un incidente de producción igualmente.
    // users.entity.spec.ts lo detiene antes, en CI, si el contrato cambia.
    if (payload.sessionToken) {
      const dbToken = user.sessionToken ?? null;
      if (!dbToken || payload.sessionToken !== dbToken) {
        throw new UnauthorizedException('SESION_DESPLAZADA');
      }
    }

    // El sessionToken no viaja más allá de esta comprobación.
    //
    // Lo que devuelve validate() acaba en request.user, y por tanto en la
    // respuesta de cualquier endpoint que haga `return @GetUser() user`
    // (/auth/me, /auth/profile...). Borrarlo aquí cierra la fuga en la raíz,
    // sin depender de que cada controller se acuerde de excluirlo.
    delete (user as any).sessionToken;

    (user as any).empresaId = payload.empresaId ?? null;
    (user as any).jti       = payload.jti;
    (user as any).exp       = payload.exp;
    return user;
  }
}
