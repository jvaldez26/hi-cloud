import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductosService } from './productos.service';
import { ProductosController } from './productos.controller';
import { Producto } from './entities/producto.entity';

import { SuscripcionesModule } from '../suscripciones/suscripciones.module';

@Module({
  imports: [TypeOrmModule.forFeature([Producto]), SuscripcionesModule],
  controllers: [ProductosController],
  providers: [ProductosService],
  exports: [ProductosService],
})
export class ProductosModule {}
