import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { PortalController } from './portal.controller';
import { Cliente } from '../clientes/entities/cliente.entity';
import { TicketSoporte } from './ticket-soporte.entity';
import { Factura } from '../facturas/entities/factura.entity';
import { NotificacionesModule } from '../notificaciones/notificaciones.module';
import { TenantModule } from '../tenant/tenant.module';
import { PdfModule } from '../facturas/pdf.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Cliente, TicketSoporte, Factura]),
    ConfigModule,
    NotificacionesModule,
    TenantModule,
    PdfModule,
  ],
  controllers: [PortalController],
})
export class PortalModule {}
