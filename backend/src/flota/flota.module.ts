import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FlotaController } from './flota.controller';
import { FlotaService } from './flota.service';
import { Vehiculo } from './entities/vehiculo.entity';
import { RegistroFlota } from './entities/registro-flota.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Vehiculo, RegistroFlota])],
  controllers: [FlotaController],
  providers: [FlotaService],
  exports: [FlotaService],
})
export class FlotaModule {}
