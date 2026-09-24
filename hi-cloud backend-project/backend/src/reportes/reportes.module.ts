import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReportesService } from './reportes.service';
import { ReportesController } from './reportes.controller';
import { ReporteGenerado } from './entities/reporte-generado.entity';
import { ReportesFinancierosModule } from '../reportes-financieros/reportes-financieros.module';

@Module({
  imports: [TypeOrmModule.forFeature([ReporteGenerado]), ReportesFinancierosModule],
  controllers: [ReportesController],
  providers: [ReportesService],
})
export class ReportesModule {}
