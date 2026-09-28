import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SoporteTicket } from './entities/soporte-ticket.entity';
import { SoporteTicketAdjunto } from './entities/soporte-ticket-adjunto.entity';
import { SoporteService } from './soporte.service';
import { SoporteAdjuntosService } from './soporte-adjuntos.service';
import { SoporteController } from './soporte.controller';
import { SoporteAdminController } from './soporte-admin.controller';
import { NotificacionesModule } from '../notificaciones/notificaciones.module';
import { SuperAdminModule } from '../super-admin/super-admin.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([SoporteTicket, SoporteTicketAdjunto]),
    NotificacionesModule, // exporta EmailService
    // SuperAdminModule exporta SuperAdminGuard, JwtModule y TokenBlacklistService
    // — necesarios para los endpoints de SoporteAdminController.
    SuperAdminModule,
    // S3Service viene de S3Module, @Global() — no hace falta importarlo aquí.
  ],
  controllers: [SoporteController, SoporteAdminController],
  providers:   [SoporteService, SoporteAdjuntosService],
  exports:     [SoporteService],
})
export class SoporteModule {}
