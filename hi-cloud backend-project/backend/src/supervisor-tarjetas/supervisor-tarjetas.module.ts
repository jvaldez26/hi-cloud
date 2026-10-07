import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TarjetaSupervisor } from './entities/tarjeta-supervisor.entity';
import { SupervisorTarjetaConfig } from './entities/supervisor-tarjeta-config.entity';
import { SupervisorTarjetasService } from './supervisor-tarjetas.service';
import { TarjetaPdfService } from './tarjeta-pdf.service';
import { SupervisorTarjetasController } from './supervisor-tarjetas.controller';

/**
 * Sin dependencia de AuthModule/AuthService (solo DataSource + sus propios
 * repos) a propósito — así AuthModule puede importar este módulo en un solo
 * sentido, sin ciclo, e inyectar SupervisorTarjetasService en AuthService.
 */
@Module({
  imports: [TypeOrmModule.forFeature([TarjetaSupervisor, SupervisorTarjetaConfig])],
  controllers: [SupervisorTarjetasController],
  providers: [SupervisorTarjetasService, TarjetaPdfService],
  exports: [SupervisorTarjetasService],
})
export class SupervisorTarjetasModule {}
