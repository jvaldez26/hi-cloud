import { Module } from '@nestjs/common';
import { TenantModule } from '../tenant/tenant.module';
import { ServiciosProService } from './servicios-pro.service';
import { ServiciosProPdfService } from './servicios-pro-pdf.service';
import { ServiciosProController } from './servicios-pro.controller';

@Module({
  imports: [TenantModule],
  providers: [ServiciosProService, ServiciosProPdfService],
  controllers: [ServiciosProController],
  exports: [ServiciosProService],
})
export class ServiciosProModule {}
