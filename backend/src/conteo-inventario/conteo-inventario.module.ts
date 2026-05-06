import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConteoInventarioController } from './conteo-inventario.controller';
import { ConteoInventarioService } from './conteo-inventario.service';
import { ConteoInventario } from './entities/conteo-inventario.entity';
import { LineaConteo } from './entities/linea-conteo.entity';
import { Producto } from '../productos/entities/producto.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ConteoInventario, LineaConteo, Producto])],
  controllers: [ConteoInventarioController],
  providers: [ConteoInventarioService],
  exports: [ConteoInventarioService],
})
export class ConteoInventarioModule {}
