import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductosService } from './productos.service';
import { ProductosController } from './productos.controller';
import { ProductoProveedorService } from './producto-proveedor.service';
import { ProductoProveedorController } from './producto-proveedor.controller';
import { Producto } from './entities/producto.entity';
import { ProductoProveedor } from './entities/producto-proveedor.entity';
import { Almacen } from '../almacenes/entities/almacen.entity';
import { StockAlmacen } from '../almacenes/entities/stock-almacen.entity';
import { Movimiento } from '../inventario/entities/movimiento.entity';
import { SuscripcionesModule } from '../suscripciones/suscripciones.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Producto, ProductoProveedor, Almacen, StockAlmacen, Movimiento]),
    SuscripcionesModule,
  ],
  controllers: [ProductosController, ProductoProveedorController],
  providers: [ProductosService, ProductoProveedorService],
  // ProductoProveedorService se exporta para que ComprasService pueda registrar
  // los vínculos al recibir mercancía. ComprasModule ya importaba ProductosModule,
  // así que no se crea ninguna dependencia circular nueva.
  exports: [ProductosService, ProductoProveedorService],
})
export class ProductosModule {}
