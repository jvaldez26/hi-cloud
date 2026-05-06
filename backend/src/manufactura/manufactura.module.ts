import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ManufacturaController } from './manufactura.controller';
import { ManufacturaService } from './manufactura.service';
import { ListaMateriales } from './entities/lista-materiales.entity';
import { ComponenteLM } from './entities/componente-lm.entity';
import { OrdenProduccion } from './entities/orden-produccion.entity';
import { Producto } from '../productos/entities/producto.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ListaMateriales, ComponenteLM, OrdenProduccion, Producto])],
  controllers: [ManufacturaController],
  providers: [ManufacturaService],
  exports: [ManufacturaService],
})
export class ManufacturaModule {}
