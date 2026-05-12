import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PeriodoContableController } from './periodo-contable.controller';
import { PeriodoContableService } from './periodo-contable.service';
import { PeriodoContable } from './entities/periodo-contable.entity';
import { AsientoContable } from '../contabilidad/entities/asiento-contable.entity';

@Module({
  imports: [TypeOrmModule.forFeature([PeriodoContable, AsientoContable])],
  controllers: [PeriodoContableController],
  providers: [PeriodoContableService],
  exports: [PeriodoContableService],
})
export class PeriodoContableModule {}
