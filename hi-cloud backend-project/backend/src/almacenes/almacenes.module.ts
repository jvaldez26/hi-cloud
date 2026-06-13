import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AlmacenesController } from './almacenes.controller';
import { AlmacenesService } from './almacenes.service';
import { Almacen } from './entities/almacen.entity';
import { StockAlmacen } from './entities/stock-almacen.entity';
import { TransferenciaAlmacen } from './entities/transferencia.entity';
import { Producto } from '../productos/entities/producto.entity';
import { Movimiento } from '../inventario/entities/movimiento.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Almacen, StockAlmacen, TransferenciaAlmacen, Producto, Movimiento])],
  controllers: [AlmacenesController],
  providers: [AlmacenesService],
  exports: [AlmacenesService],
})
export class AlmacenesModule {}
