import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductosService } from './productos.service';
import { ProductosController } from './productos.controller';
import { Producto } from './entities/producto.entity';
import { Almacen } from '../almacenes/entities/almacen.entity';
import { StockAlmacen } from '../almacenes/entities/stock-almacen.entity';
import { Movimiento } from '../inventario/entities/movimiento.entity';
import { SuscripcionesModule } from '../suscripciones/suscripciones.module';

@Module({
  imports: [TypeOrmModule.forFeature([Producto, Almacen, StockAlmacen, Movimiento]), SuscripcionesModule],
  controllers: [ProductosController],
  providers: [ProductosService],
  exports: [ProductosService],
})
export class ProductosModule {}
