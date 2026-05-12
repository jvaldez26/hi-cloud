import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SuperAdminController } from './super-admin.controller';
import { SuperAdminService }    from './super-admin.service';
import { SuperAdminGuard }      from './super-admin.guard';
import { BackupService }        from './backup.service';
import { BackupRegistro }       from './entities/backup-registro.entity';
import { SuscripcionesModule }  from '../suscripciones/suscripciones.module';

@Module({
  imports: [
    ConfigModule,
    SuscripcionesModule,
    TypeOrmModule.forFeature([BackupRegistro]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject:  [ConfigService],
      useFactory: (cfg: ConfigService) => ({ secret: cfg.get<string>('JWT_SECRET') }),
    }),
  ],
  controllers: [SuperAdminController],
  providers:   [SuperAdminService, SuperAdminGuard, BackupService],
  exports:     [SuperAdminGuard],
})
export class SuperAdminModule {}
