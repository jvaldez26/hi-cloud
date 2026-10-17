import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductosService } from './productos.service';
import { ProductosController } from './productos.controller';
import { ProductoProveedorService } from './producto-proveedor.service';
import { ProductoProveedorController } from './producto-proveedor.controller';
import { CategoriasProductoService } from './categorias-producto.service';
import { CategoriasProductoController } from './categorias-producto.controller';
import { Producto } from './entities/producto.entity';
import { ProductoProveedor } from './entities/producto-proveedor.entity';
import { CategoriaProducto } from './entities/categoria-producto.entity';
import { Almacen } from '../almacenes/entities/almacen.entity';
import { StockAlmacen } from '../almacenes/entities/stock-almacen.entity';
import { Movimiento } from '../inventario/entities/movimiento.entity';
import { SuscripcionesModule } from '../suscripciones/suscripciones.module';
import { ValoracionStockModule } from '../valoracion-stock/valoracion-stock.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Producto, ProductoProveedor, CategoriaProducto, Almacen, StockAlmacen, Movimiento]),
    SuscripcionesModule,
    ValoracionStockModule,
  ],
  controllers: [ProductosController, ProductoProveedorController, CategoriasProductoController],
  providers: [ProductosService, ProductoProveedorService, CategoriasProductoService],
  // ProductoProveedorService se exporta para que ComprasService pueda registrar
  // los vínculos al recibir mercancía. ComprasModule ya importaba ProductosModule,
  // así que no se crea ninguna dependencia circular nueva. CategoriasProductoService
  // se exporta para que ImportacionModule resuelva/cree categorías por nombre al
  // importar un CSV (ver importacion.service.ts).
  exports: [ProductosService, ProductoProveedorService, CategoriasProductoService],
})
export class ProductosModule {}
