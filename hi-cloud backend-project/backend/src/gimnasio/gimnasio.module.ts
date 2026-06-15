import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Miembro } from './entities/miembro.entity';
import { PlanGimnasio } from './entities/plan-gimnasio.entity';
import { Membresia } from './entities/membresia.entity';
import { Entrenador } from './entities/entrenador.entity';
import { Clase } from './entities/clase.entity';
import { Schedule } from './entities/schedule.entity';
import { ReservaClase } from './entities/reserva-clase.entity';
import { SesionEP } from './entities/sesion-ep.entity';
import { Rutina } from './entities/rutina.entity';
import { RutinaDia } from './entities/rutina-dia.entity';
import { RutinaEjercicio } from './entities/rutina-ejercicio.entity';
import { Progreso } from './entities/progreso.entity';
import { Acceso } from './entities/acceso.entity';
import { Locker } from './entities/locker.entity';
import { PlanNutricional } from './entities/plan-nutricional.entity';
import { Comida } from './entities/comida.entity';
import { ProductoTienda } from './entities/producto-tienda.entity';
import { GimnasioService } from './gimnasio.service';
import { GimnasioPdfService } from './gimnasio-pdf.service';
import { GimnasioCronService } from './gimnasio-cron.service';
import { GimnasioController } from './gimnasio.controller';
import { TenantModule } from '../tenant/tenant.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Miembro,
      PlanGimnasio,
      Membresia,
      Entrenador,
      Clase,
      Schedule,
      ReservaClase,
      SesionEP,
      Rutina,
      RutinaDia,
      RutinaEjercicio,
      Progreso,
      Acceso,
      Locker,
      PlanNutricional,
      Comida,
      ProductoTienda,
    ]),
    TenantModule,
  ],
  providers: [GimnasioService, GimnasioPdfService, GimnasioCronService],
  controllers: [GimnasioController],
  exports: [GimnasioService],
})
export class GimnasioModule {}
