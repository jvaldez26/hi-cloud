import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { FacturasRecurrentesService } from './facturas-recurrentes.service';
import { FacturasRecurrentesController } from './facturas-recurrentes.controller';
import { FacturaRecurrente } from './entities/factura-recurrente.entity';
import { Factura } from '../facturas/entities/factura.entity';
import { FacturaDetalle } from '../facturas/entities/factura-detalle.entity';
import { EmailService } from '../notificaciones/services/email.service';
import { FacturasModule } from '../facturas/facturas.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([FacturaRecurrente, Factura, FacturaDetalle]),
    ConfigModule,
    FacturasModule,
  ],
  controllers: [FacturasRecurrentesController],
  providers: [FacturasRecurrentesService, EmailService],
  exports: [FacturasRecurrentesService],
})
export class FacturasRecurrentesModule {}
