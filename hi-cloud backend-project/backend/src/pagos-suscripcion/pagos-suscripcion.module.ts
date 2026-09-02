import { Module }               from '@nestjs/common';
import { TypeOrmModule }        from '@nestjs/typeorm';
import { PagoSuscripcion }      from './entities/pago-suscripcion.entity';
import { ConfiguracionBancaria } from './entities/configuracion-bancaria.entity';
import { PagosSuscripcionService } from './pagos-suscripcion.service';
import {
  PagosSuscripcionController,
  PagosSuscripcionAdminController,
} from './pagos-suscripcion.controller';
import { NotificacionesModule } from '../notificaciones/notificaciones.module';
import { TenantModule }         from '../tenant/tenant.module';
import { S3Module }             from '../common/s3/s3.module';
import { SuperAdminModule }     from '../super-admin/super-admin.module';
import { SuscripcionesModule }  from '../suscripciones/suscripciones.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([PagoSuscripcion, ConfiguracionBancaria]),
    NotificacionesModule,
    TenantModule,
    S3Module,
    SuperAdminModule,
    // Para CuotaEcfService: el cargo por excedente recuenta los comprobantes y
    // relee el precio en el momento de cobrar. Sin ciclo — SuscripcionesModule
    // no importa este.
    SuscripcionesModule,
  ],
  controllers: [PagosSuscripcionController, PagosSuscripcionAdminController],
  providers:   [PagosSuscripcionService],
  exports:     [PagosSuscripcionService],
})
export class PagosSuscripcionModule {}
