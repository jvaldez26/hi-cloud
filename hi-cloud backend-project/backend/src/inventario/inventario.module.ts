import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InventarioService } from './inventario.service';
import { InventarioController } from './inventario.controller';
import { Movimiento } from './entities/movimiento.entity';
import { LoteProducto } from './entities/lote-producto.entity';
import { SerialProducto } from './entities/serial-producto.entity';
import { Producto } from '../productos/entities/producto.entity';
import { NotificacionesModule } from '../notificaciones/notificaciones.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Movimiento, Producto, LoteProducto, SerialProducto]),
    NotificacionesModule,
  ],
  controllers: [InventarioController],
  providers: [InventarioService],
  exports: [InventarioService],
})
export class InventarioModule {}
