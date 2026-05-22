import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DeclaracionesController } from './declaraciones.controller';
import { DeclaracionesService } from './declaraciones.service';
import { DeclaracionesPdfService } from './declaraciones-pdf.service';
import { DgiiValidatorService } from './dgii-validator.service';
import { DgiiTxtGeneratorService } from './dgii-txt.generator';
import { ReporteDgii } from './entities/reporte-dgii.entity';
import { Factura } from '../facturas/entities/factura.entity';
import { FacturaDetalle } from '../facturas/entities/factura-detalle.entity';
import { Compra } from '../compras/entities/compra.entity';
import { CompraDetalle } from '../compras/entities/compra-detalle.entity';
import { BrowserService } from '../common/services/browser.service';

@Module({
  imports: [TypeOrmModule.forFeature([Factura, FacturaDetalle, Compra, CompraDetalle, ReporteDgii])],
  controllers: [DeclaracionesController],
  providers:   [DeclaracionesService, DeclaracionesPdfService, DgiiValidatorService, DgiiTxtGeneratorService, BrowserService],
  exports:     [DeclaracionesService],
})
export class DeclaracionesModule {}
