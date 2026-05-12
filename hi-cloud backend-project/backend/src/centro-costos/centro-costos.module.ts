import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CentroCostosController } from './centro-costos.controller';
import { CentroCostosService } from './centro-costos.service';
import { CentroCosto } from './entities/centro-costo.entity';
import { AsignacionCosto } from './entities/asignacion-costo.entity';

@Module({
  imports: [TypeOrmModule.forFeature([CentroCosto, AsignacionCosto])],
  controllers: [CentroCostosController],
  providers: [CentroCostosService],
  exports: [CentroCostosService],
})
export class CentroCostosModule {}
