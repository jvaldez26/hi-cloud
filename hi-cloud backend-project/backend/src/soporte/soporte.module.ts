import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SoporteTicket } from './entities/soporte-ticket.entity';
import { SoporteService } from './soporte.service';
import { SoporteController } from './soporte.controller';
import { SoporteAdminController } from './soporte-admin.controller';
import { NotificacionesModule } from '../notificaciones/notificaciones.module';
import { SuperAdminModule } from '../super-admin/super-admin.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([SoporteTicket]),
    NotificacionesModule, // exporta EmailService
    // SuperAdminModule exporta SuperAdminGuard, JwtModule y TokenBlacklistService
    // — necesarios para los endpoints de SoporteAdminController.
    SuperAdminModule,
  ],
  controllers: [SoporteController, SoporteAdminController],
  providers:   [SoporteService],
  exports:     [SoporteService],
})
export class SoporteModule {}
