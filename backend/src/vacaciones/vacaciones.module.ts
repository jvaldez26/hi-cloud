import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VacacionesController } from './vacaciones.controller';
import { VacacionesService } from './vacaciones.service';
import { SolicitudVacacion } from './entities/solicitud-vacacion.entity';
import { Ausencia } from './entities/ausencia.entity';
import { Empleado } from '../nomina/entities/empleado.entity';

@Module({
  imports: [TypeOrmModule.forFeature([SolicitudVacacion, Ausencia, Empleado])],
  controllers: [VacacionesController],
  providers: [VacacionesService],
  exports: [VacacionesService],
})
export class VacacionesModule {}
