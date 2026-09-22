import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReportesFinancierosController } from './reportes-financieros.controller';
import { ReportesFinancierosService }    from './reportes-financieros.service';
import { BalanceComprobacionService }    from './balance-comprobacion.service';
import { SaldosCuentasService }          from './saldos-cuentas.service';
import { ReportesPdfService }            from './reportes-pdf.service';
import { BalanceGeneralDetalladoService } from './balance-general-detallado.service';
import { BalanceGeneralExportService }   from './balance-general-export.service';
import { EstadoResultadosDetalladoService } from './estado-resultados-detallado.service';
import { EstadoResultadosExportService }    from './estado-resultados-export.service';
import { FlujoEfectivoDetalladoService } from './flujo-efectivo-detallado.service';
import { FlujoEfectivoExportService }    from './flujo-efectivo-export.service';
import { AsientoContable } from '../contabilidad/entities/asiento-contable.entity';
import { CuentaContable }  from '../contabilidad/entities/cuenta-contable.entity';
import { Empresa }         from '../configuracion/entities/empresa.entity';

@Module({
  imports: [TypeOrmModule.forFeature([AsientoContable, CuentaContable, Empresa])],
  controllers: [ReportesFinancierosController],
  providers: [
    ReportesFinancierosService, BalanceComprobacionService, SaldosCuentasService, ReportesPdfService,
    BalanceGeneralDetalladoService, BalanceGeneralExportService,
    EstadoResultadosDetalladoService, EstadoResultadosExportService,
    FlujoEfectivoDetalladoService, FlujoEfectivoExportService,
  ],
  exports: [
    ReportesFinancierosService, BalanceComprobacionService, SaldosCuentasService, ReportesPdfService,
    BalanceGeneralDetalladoService, BalanceGeneralExportService,
    EstadoResultadosDetalladoService, EstadoResultadosExportService,
    FlujoEfectivoDetalladoService, FlujoEfectivoExportService,
  ],
})
export class ReportesFinancierosModule {}
