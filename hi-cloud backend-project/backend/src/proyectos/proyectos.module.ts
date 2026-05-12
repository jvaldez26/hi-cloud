import { Module } from '@nestjs/common';
import { SuscripcionesModule } from '../suscripciones/suscripciones.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProyectosController } from './proyectos.controller';
import { ProyectosService } from './proyectos.service';
import { Proyecto } from './entities/proyecto.entity';
import { Tarea } from './entities/tarea.entity';
import { RegistroTiempo } from './entities/registro-tiempo.entity';
import { PresupuestoProyectoLinea } from './entities/presupuesto-proyecto-linea.entity';
import { HitoProyecto } from './entities/hito-proyecto.entity';

@Module({
  imports: [SuscripcionesModule, TypeOrmModule.forFeature([
    Proyecto, Tarea, RegistroTiempo, PresupuestoProyectoLinea, HitoProyecto,
  ])],
  controllers: [ProyectosController],
  providers: [ProyectosService],
  exports: [ProyectosService],
})
export class ProyectosModule {}
