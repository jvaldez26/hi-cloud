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
    // Sesión única — FALLA CERRADO.
    //
    // Antes esto era `if (payload.sessionToken) { ...validar... }`, y ahí estaba
    // el agujero: un token SIN el campo se saltaba la validación entera y se
    // convertía en un pase libre. Eso es justo lo que emitían cambiarEmpresa y
    // cambiarSucursal, así que bastaba con cambiar de empresa una vez para
    // quedarse sin sesión única de forma permanente, y en silencio.
    //
    // Un access token sin sessionToken solo puede venir de un bug de emisión, de
    // un token anterior a esta protección, o de manipulación. En ninguno de los
    // tres casos debe pasar.
    //
    // Nota: el único otro JWT que existe es el temporal de 2FA, que viaja en la
    // cookie `2fa_pending` y se verifica a mano en verify2FA. extractJwtFromRequest
    // solo lee `access_token` y `Authorization: Bearer`, así que nunca llega aquí.
    if (!payload.sessionToken) {
      throw new UnauthorizedException('TOKEN_OBSOLETO');
    }
    // El valor de BD viene de findByIdForAuth (addSelect explícito); un findById
    // normal lo dejaría undefined y esto lanzaría, que es el lado seguro.
    const dbToken = user.sessionToken ?? null;
    if (!dbToken || payload.sessionToken !== dbToken) {
      throw new UnauthorizedException('SESION_DESPLAZADA');
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
