import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MantenimientoController } from './mantenimiento.controller';
import { MantenimientoService } from './mantenimiento.service';
import { OrdenMantenimiento } from './entities/orden-mantenimiento.entity';
import { ProgramaMantenimiento } from './entities/programa-mantenimiento.entity';
import { ActivoFijo } from '../activos-fijos/entities/activo-fijo.entity';
import { ContabilidadModule } from '../contabilidad/contabilidad.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([OrdenMantenimiento, ProgramaMantenimiento, ActivoFijo]),
    ContabilidadModule,
  ],
  controllers: [MantenimientoController],
  providers: [MantenimientoService],
  exports: [MantenimientoService],
})
export class MantenimientoModule {}
