import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PortalEmpleadoController } from './portal-empleado.controller';
import { PortalEmpleadoService } from './portal-empleado.service';
import { Empleado } from '../nomina/entities/empleado.entity';
import { ContratoLaboral } from '../nomina/entities/contrato-laboral.entity';
import { IsrModule } from '../isr/isr.module';
import { NotificacionesModule } from '../notificaciones/notificaciones.module';

@Module({
  imports: [TypeOrmModule.forFeature([Empleado, ContratoLaboral]), IsrModule, NotificacionesModule],
  controllers: [PortalEmpleadoController],
  providers: [PortalEmpleadoService],
  exports: [PortalEmpleadoService],
})
export class PortalEmpleadoModule {}
