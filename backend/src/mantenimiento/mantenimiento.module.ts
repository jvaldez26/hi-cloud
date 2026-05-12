import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MantenimientoController } from './mantenimiento.controller';
import { MantenimientoService } from './mantenimiento.service';
import { OrdenMantenimiento } from './entities/orden-mantenimiento.entity';
import { ProgramaMantenimiento } from './entities/programa-mantenimiento.entity';

@Module({
  imports: [TypeOrmModule.forFeature([OrdenMantenimiento, ProgramaMantenimiento])],
  controllers: [MantenimientoController],
  providers: [MantenimientoService],
  exports: [MantenimientoService],
})
export class MantenimientoModule {}
