import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { LoginAttemptsService } from './login-attempts.service';
import { TokenBlacklistService } from './token-blacklist.service';
import { RefreshTokenService } from './refresh-token.service';
import { RefreshToken } from './entities/refresh-token.entity';
import { RolesGuard } from './guards/roles.guard';
import { TwoFactorService } from './two-factor.service';
import { TwoFactorController } from './two-factor.controller';
import { UsersModule } from '../users/users.module';
import { NotificacionesModule } from '../notificaciones/notificaciones.module';
import { JwtStrategy } from './strategies/jwt.strategy';
import { GoogleStrategy } from './strategies/google.strategy';
import { User } from '../users/users.entity';
import { UsuarioEmpresa } from '../multi-empresa/entities/usuario-empresa.entity';
import { Empresa } from '../configuracion/entities/empresa.entity';
import { Sucursal } from '../configuracion/entities/sucursal.entity';
import { ContabilidadModule } from '../contabilidad/contabilidad.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, UsuarioEmpresa, Empresa, Sucursal, RefreshToken]),
    UsersModule,
    NotificacionesModule,
    ContabilidadModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const secret = config.get<string>('JWT_SECRET');
        if (!secret) throw new Error('JWT_SECRET no está configurado. Define esta variable de entorno antes de iniciar.');
        return {
          secret,
          // S-28: access token de corta duración — refresh token renueva la sesión
          signOptions: {
            expiresIn:  (config.get<string>('JWT_EXPIRES_IN', '15m')) as any,
            algorithm:  'HS256',   // S-46: algoritmo explícito — previene alg confusion
          },
          verifyOptions: { algorithms: ['HS256'] },
        };
      },
    }),
  ],
  controllers: [AuthController, TwoFactorController],
  providers: [AuthService, JwtStrategy, GoogleStrategy, TwoFactorService, TokenBlacklistService, RefreshTokenService, RolesGuard, LoginAttemptsService],
  exports: [JwtModule, PassportModule, TokenBlacklistService, RefreshTokenService, RolesGuard],
})
export class AuthModule {}
