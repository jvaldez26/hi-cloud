import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DistribucionCostosService } from './distribucion-costos.service';
import { DistribucionCostosController } from './distribucion-costos.controller';
import { ReglaDistribucion } from './entities/regla-distribucion.entity';
import { ReglaDistribucionLinea } from './entities/regla-distribucion-linea.entity';
import { ContabilidadModule } from '../contabilidad/contabilidad.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ReglaDistribucion, ReglaDistribucionLinea]),
    ContabilidadModule,
  ],
  controllers: [DistribucionCostosController],
  providers: [DistribucionCostosService],
  exports: [DistribucionCostosService],
})
export class DistribucionCostosModule {}
