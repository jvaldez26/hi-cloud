import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PreFacturaController } from './pre-factura.controller';
import { PreFacturaService } from './pre-factura.service';
import { PreFacturaPDFService } from './pre-factura-pdf.service';
import { PreFactura } from './entities/pre-factura.entity';
import { PreFacturaDetalle } from './entities/pre-factura-detalle.entity';
import { Factura } from '../facturas/entities/factura.entity';
import { BrowserService } from '../common/services/browser.service';

@Module({
  imports: [TypeOrmModule.forFeature([PreFactura, PreFacturaDetalle, Factura])],
  controllers: [PreFacturaController],
  providers: [PreFacturaService, PreFacturaPDFService, BrowserService],
  exports: [PreFacturaService],
})
export class PreFacturaModule {}
