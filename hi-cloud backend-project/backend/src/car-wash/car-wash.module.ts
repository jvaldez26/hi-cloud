import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CwConfig } from './entities/cw-config.entity';
import { CwServicio } from './entities/cw-servicio.entity';
import { CwServicioPrecio } from './entities/cw-servicio-precio.entity';
import { CwTurno } from './entities/cw-turno.entity';
import { CwTurnoServicio } from './entities/cw-turno-servicio.entity';
import { CwTurnoFoto } from './entities/cw-turno-foto.entity';
import { CwTurnoEvento } from './entities/cw-turno-evento.entity';
import { CwContadorTurno } from './entities/cw-contador-turno.entity';
import { CwLavador } from './entities/cw-lavador.entity';
import { CwTurnoLavador } from './entities/cw-turno-lavador.entity';
import { CwComision } from './entities/cw-comision.entity';
import { CwAdelanto } from './entities/cw-adelanto.entity';
import { CwLiquidacion } from './entities/cw-liquidacion.entity';
import { Producto } from '../productos/entities/producto.entity';
import { CwConfigService } from './services/cw-config.service';
import { CwServiciosService } from './services/cw-servicios.service';
import { CwContadorService } from './services/cw-contador.service';
import { CwTurnosService } from './services/cw-turnos.service';
import { CwTurnoFotosService } from './services/cw-turno-fotos.service';
import { CwLavadoresService } from './services/cw-lavadores.service';
import { CwComisionesService } from './services/cw-comisiones.service';
import { CwAdelantosService } from './services/cw-adelantos.service';
import { CwLiquidacionesService } from './services/cw-liquidaciones.service';
import { CwDashboardService } from './services/cw-dashboard.service';
import { CarWashController } from './car-wash.controller';
import { CarWashLavadoresController } from './car-wash-lavadores.controller';
import { CarWashPublicoController } from './car-wash-publico.controller';
import { TenantModule } from '../tenant/tenant.module';
import { CajaModule } from '../caja/caja.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CwConfig, CwServicio, CwServicioPrecio, CwTurno, CwTurnoServicio,
      CwTurnoFoto, CwTurnoEvento, CwContadorTurno,
      CwLavador, CwTurnoLavador, CwComision, CwAdelanto, CwLiquidacion,
      Producto,
    ]),
    TenantModule,
    CajaModule,
  ],
  controllers: [CarWashController, CarWashLavadoresController, CarWashPublicoController],
  providers: [
    CwConfigService, CwServiciosService, CwContadorService, CwTurnosService, CwTurnoFotosService,
    CwLavadoresService, CwComisionesService, CwAdelantosService, CwLiquidacionesService, CwDashboardService,
  ],
  exports: [
    CwConfigService, CwServiciosService, CwTurnosService, CwTurnoFotosService,
    CwLavadoresService, CwComisionesService, CwAdelantosService, CwLiquidacionesService, CwDashboardService,
  ],
})
export class CarWashModule {}
