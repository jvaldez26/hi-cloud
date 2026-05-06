import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReportesFinancierosController } from './reportes-financieros.controller';
import { ReportesFinancierosService } from './reportes-financieros.service';
import { BalanceComprobacionService } from './balance-comprobacion.service';
import { AsientoContable } from '../contabilidad/entities/asiento-contable.entity';

@Module({
  imports: [TypeOrmModule.forFeature([AsientoContable])],
  controllers: [ReportesFinancierosController],
  providers: [ReportesFinancierosService, BalanceComprobacionService],
  exports: [ReportesFinancierosService, BalanceComprobacionService],
})
export class ReportesFinancierosModule {}
