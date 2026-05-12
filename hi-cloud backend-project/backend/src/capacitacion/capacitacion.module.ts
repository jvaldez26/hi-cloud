import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CapacitacionController } from './capacitacion.controller';
import { CapacitacionService } from './capacitacion.service';
import { Curso } from './entities/curso.entity';
import { SesionCapacitacion } from './entities/sesion-capacitacion.entity';
import { RegistroCapacitacion } from './entities/registro-capacitacion.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Curso, SesionCapacitacion, RegistroCapacitacion])],
  controllers: [CapacitacionController],
  providers: [CapacitacionService],
  exports: [CapacitacionService],
})
export class CapacitacionModule {}
