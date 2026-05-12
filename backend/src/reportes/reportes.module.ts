import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReportesService } from './reportes.service';
import { ReportesController } from './reportes.controller';
import { ReporteGenerado } from './entities/reporte-generado.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ReporteGenerado])],
  controllers: [ReportesController],
  providers: [ReportesService],
})
export class ReportesModule {}
