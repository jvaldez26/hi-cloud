import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SucursalesController } from './sucursales.controller';
import { SucursalesService } from './sucursales.service';
import { Sucursal } from '../configuracion/entities/sucursal.entity';
import { Almacen } from '../almacenes/entities/almacen.entity';
import { StockAlmacen } from '../almacenes/entities/stock-almacen.entity';
import { SuscripcionesModule } from '../suscripciones/suscripciones.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Sucursal, Almacen, StockAlmacen]),
    SuscripcionesModule,
  ],
  controllers: [SucursalesController],
  providers: [SucursalesService],
  exports: [SucursalesService],
})
export class SucursalesModule {}
