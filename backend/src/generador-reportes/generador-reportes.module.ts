import { Module } from '@nestjs/common';
import { GeneradorReportesController } from './generador-reportes.controller';
import { GeneradorReportesService } from './generador-reportes.service';

@Module({
  controllers: [GeneradorReportesController],
  providers: [GeneradorReportesService],
  exports: [GeneradorReportesService],
})
export class GeneradorReportesModule {}
