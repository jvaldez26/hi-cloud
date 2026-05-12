import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PlaneacionDemandaService } from './planeacion-demanda.service';
import { PlaneacionDemandaController } from './planeacion-demanda.controller';
import { PlanDemanda } from './entities/plan-demanda.entity';
import { PlanDemandaLinea } from './entities/plan-demanda-linea.entity';
import { Producto } from '../productos/entities/producto.entity';

@Module({
  imports: [TypeOrmModule.forFeature([PlanDemanda, PlanDemandaLinea, Producto])],
  controllers: [PlaneacionDemandaController],
  providers: [PlaneacionDemandaService],
  exports: [PlaneacionDemandaService],
})
export class PlaneacionDemandaModule {}
