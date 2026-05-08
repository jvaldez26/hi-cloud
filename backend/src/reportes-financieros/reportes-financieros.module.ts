import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReportesFinancierosController } from './reportes-financieros.controller';
import { ReportesFinancierosService }    from './reportes-financieros.service';
import { BalanceComprobacionService }    from './balance-comprobacion.service';
import { ReportesPdfService }            from './reportes-pdf.service';
import { AsientoContable } from '../contabilidad/entities/asiento-contable.entity';
import { Empresa }         from '../configuracion/entities/empresa.entity';

@Module({
  imports: [TypeOrmModule.forFeature([AsientoContable, Empresa])],
  controllers: [ReportesFinancierosController],
  providers: [ReportesFinancierosService, BalanceComprobacionService, ReportesPdfService],
  exports:   [ReportesFinancierosService, BalanceComprobacionService, ReportesPdfService],
})
export class ReportesFinancierosModule {}
