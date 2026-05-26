import { Module } from '@nestjs/common';
import { SuscripcionesModule } from '../suscripciones/suscripciones.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NominaService } from './nomina.service';
import { NominaController } from './nomina.controller';
import { NominaCalculosService } from './services/nomina-calculos.service';
import { Empleado } from './entities/empleado.entity';
import { NominaPeriodo } from './entities/nomina-periodo.entity';
import { NominaLinea } from './entities/nomina-linea.entity';
import { NominaNovedadEmpleado } from './entities/nomina-novedad.entity';
import { ContratoLaboral } from './entities/contrato-laboral.entity';
import { ContabilidadModule } from '../contabilidad/contabilidad.module';
import { TesoreriaModule } from '../tesoreria/tesoreria.module';
import { NotificacionesModule } from '../notificaciones/notificaciones.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Empleado,
      NominaPeriodo,
      NominaLinea,
      NominaNovedadEmpleado,
      ContratoLaboral,
    ]),
    ContabilidadModule,
    TesoreriaModule,
    SuscripcionesModule,
    NotificacionesModule,
  ],
  controllers: [NominaController],
  providers: [NominaService, NominaCalculosService],
  exports: [NominaService],
})
export class NominaModule {}
