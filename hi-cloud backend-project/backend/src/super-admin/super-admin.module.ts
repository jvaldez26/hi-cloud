import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SuperAdminController }  from './super-admin.controller';
import { DebugController }       from './debug.controller';
import { SuperAdminService }     from './super-admin.service';
import { SuperAdminGuard }       from './super-admin.guard';
import { BackupService }         from './backup.service';
import { BackupRegistro }        from './entities/backup-registro.entity';
import { TokenBlacklistService } from '../auth/token-blacklist.service';
import { SuscripcionesModule }   from '../suscripciones/suscripciones.module';
import { NotificacionesModule }  from '../notificaciones/notificaciones.module';
import { ContabilidadModule }    from '../contabilidad/contabilidad.module';
import { ModulosAddonModule }    from '../modulos-addon/modulos-addon.module';

@Module({
  imports: [
    ConfigModule,
    SuscripcionesModule,
    NotificacionesModule,
    ContabilidadModule,
    ModulosAddonModule,
    TypeOrmModule.forFeature([BackupRegistro]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject:  [ConfigService],
      useFactory: (cfg: ConfigService) => {
        const secret = cfg.get<string>('JWT_SECRET');
        if (!secret) throw new Error('JWT_SECRET requerido (super-admin.module)');
        return { secret };
      },
    }),
  ],
  controllers: [SuperAdminController, DebugController],
  providers:   [SuperAdminService, SuperAdminGuard, BackupService, TokenBlacklistService],
  exports:     [SuperAdminGuard, JwtModule, TokenBlacklistService],
})
export class SuperAdminModule {}
