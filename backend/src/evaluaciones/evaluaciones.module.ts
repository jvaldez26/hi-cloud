import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EvaluacionesController } from './evaluaciones.controller';
import { EvaluacionesService } from './evaluaciones.service';
import { EvaluacionEmpleado } from './entities/evaluacion.entity';
import { Empleado } from '../nomina/entities/empleado.entity';

@Module({
  imports: [TypeOrmModule.forFeature([EvaluacionEmpleado, Empleado])],
  controllers: [EvaluacionesController],
  providers: [EvaluacionesService],
  exports: [EvaluacionesService],
})
export class EvaluacionesModule {}
