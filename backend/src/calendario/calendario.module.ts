import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CalendarioController } from './calendario.controller';
import { CalendarioService } from './calendario.service';
import { CuentaPorCobrar } from '../cxc/entities/cuenta-por-cobrar.entity';
import { CuentaPorPagar } from '../cxp/entities/cuenta-por-pagar.entity';
import { Contrato } from '../contratos/entities/contrato.entity';
import { NominaPeriodo } from '../nomina/entities/nomina-periodo.entity';

@Module({
  imports: [TypeOrmModule.forFeature([CuentaPorCobrar, CuentaPorPagar, Contrato, NominaPeriodo])],
  controllers: [CalendarioController],
  providers: [CalendarioService],
  exports: [CalendarioService],
})
export class CalendarioModule {}
