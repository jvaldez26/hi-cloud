import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FacturasRecurrentesService } from './facturas-recurrentes.service';
import { FacturasRecurrentesController } from './facturas-recurrentes.controller';
import { FacturaRecurrente } from './entities/factura-recurrente.entity';
import { Factura } from '../facturas/entities/factura.entity';
import { FacturaDetalle } from '../facturas/entities/factura-detalle.entity';

@Module({
  imports: [TypeOrmModule.forFeature([FacturaRecurrente, Factura, FacturaDetalle])],
  controllers: [FacturasRecurrentesController],
  providers: [FacturasRecurrentesService],
  exports: [FacturasRecurrentesService],
})
export class FacturasRecurrentesModule {}
