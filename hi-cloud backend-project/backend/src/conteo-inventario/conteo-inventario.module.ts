import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConteoInventarioController } from './conteo-inventario.controller';
import { ConteoInventarioService } from './conteo-inventario.service';
import { ConteoInventario } from './entities/conteo-inventario.entity';
import { LineaConteo } from './entities/linea-conteo.entity';
import { ConteoAjuste } from './entities/conteo-ajuste.entity';
import { Producto } from '../productos/entities/producto.entity';
import { Movimiento } from '../inventario/entities/movimiento.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ConteoInventario, LineaConteo, ConteoAjuste, Producto, Movimiento])],
  controllers: [ConteoInventarioController],
  providers: [ConteoInventarioService],
  exports: [ConteoInventarioService],
})
export class ConteoInventarioModule {}
