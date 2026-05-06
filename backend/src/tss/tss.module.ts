import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TSSController } from './tss.controller';
import { TSSService } from './tss.service';
import { Empleado } from '../nomina/entities/empleado.entity';
import { NominaPeriodo } from '../nomina/entities/nomina-periodo.entity';
import { NominaLinea } from '../nomina/entities/nomina-linea.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Empleado, NominaPeriodo, NominaLinea])],
  controllers: [TSSController],
  providers: [TSSService],
  exports: [TSSService],
})
export class TSSModule {}
