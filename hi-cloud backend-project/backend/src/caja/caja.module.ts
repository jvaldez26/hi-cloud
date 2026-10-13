import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CajaService } from './caja.service';
import { CajaController } from './caja.controller';
import { CierreCaja } from './entities/cierre-caja.entity';
import { RetiroCaja } from './entities/retiro-caja.entity';
import { AjusteCierreCaja } from './entities/ajuste-cierre-caja.entity';
import { TenantModule } from '../tenant/tenant.module';
import { NotificacionesModule } from '../notificaciones/notificaciones.module';
import { ModulosAddonModule } from '../modulos-addon/modulos-addon.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([CierreCaja, RetiroCaja, AjusteCierreCaja]),
    TenantModule,
    NotificacionesModule,
    ModulosAddonModule,
  ],
  controllers: [CajaController],
  providers: [CajaService],
  exports: [CajaService],
})
export class CajaModule {}
