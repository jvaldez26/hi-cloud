import { Module } from '@nestjs/common';
import { SuscripcionesModule } from '../suscripciones/suscripciones.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NominaService } from './nomina.service';
import { NominaController } from './nomina.controller';
import { NominaCalculosService } from './services/nomina-calculos.service';
import { Empleado } from './entities/empleado.entity';
import { NominaPeriodo } from './entities/nomina-periodo.entity';
import { NominaLinea } from './entities/nomina-linea.entity';
import { ContabilidadModule } from '../contabilidad/contabilidad.module';
import { TesoreriaModule } from '../tesoreria/tesoreria.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Empleado, NominaPeriodo, NominaLinea]),
    ContabilidadModule, TesoreriaModule, SuscripcionesModule,
  ],
  controllers: [NominaController],
  providers: [NominaService, NominaCalculosService],
  exports: [NominaService],
})
export class NominaModule {}
