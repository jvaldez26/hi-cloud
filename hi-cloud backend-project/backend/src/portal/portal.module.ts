import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { PortalController } from './portal.controller';
import { Cliente } from '../clientes/entities/cliente.entity';
import { TicketSoporte } from './ticket-soporte.entity';
import { NotificacionesModule } from '../notificaciones/notificaciones.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Cliente, TicketSoporte]),
    ConfigModule,
    NotificacionesModule,
  ],
  controllers: [PortalController],
})
export class PortalModule {}
