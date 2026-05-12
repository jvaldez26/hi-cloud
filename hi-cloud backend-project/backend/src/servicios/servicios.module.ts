import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ServiciosService } from './servicios.service';
import { ServiciosController } from './servicios.controller';
import { OrdenServicio, OrdenServicioDetalle } from './entities/orden-servicio.entity';
import { Factura } from '../facturas/entities/factura.entity';
import { FacturaDetalle } from '../facturas/entities/factura-detalle.entity';

@Module({
  imports: [TypeOrmModule.forFeature([OrdenServicio, OrdenServicioDetalle, Factura, FacturaDetalle])],
  controllers: [ServiciosController],
  providers: [ServiciosService],
  exports: [ServiciosService],
})
export class ServiciosModule {}
