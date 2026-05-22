import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RetencionesService } from './retenciones.service';
import { RetencionPDFService } from './retencion-pdf.service';
import { RetencionesController } from './retenciones.controller';
import { RetencionISR } from './entities/retencion-isr.entity';
import { BrowserService } from '../common/services/browser.service';

@Module({
  imports: [TypeOrmModule.forFeature([RetencionISR])],
  controllers: [RetencionesController],
  providers: [RetencionesService, RetencionPDFService, BrowserService],
  exports: [RetencionesService],
})
export class RetencionesModule {}
