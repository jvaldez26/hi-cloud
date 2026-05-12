import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PortalController } from './portal.controller';
import { Cliente } from '../clientes/entities/cliente.entity';
import { TicketSoporte } from './ticket-soporte.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Cliente, TicketSoporte])],
  controllers: [PortalController],
})
export class PortalModule {}
