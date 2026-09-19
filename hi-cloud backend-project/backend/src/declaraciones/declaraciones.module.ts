import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DeclaracionesController } from './declaraciones.controller';
import { DeclaracionesService } from './declaraciones.service';
import { DeclaracionesPdfService } from './declaraciones-pdf.service';
import { DgiiValidatorService } from './dgii-validator.service';
import { DgiiTxtGeneratorService } from './dgii-txt.generator';
import { ConciliacionFiscalService } from './conciliacion-fiscal.service';
import { AnexosIR2Service } from './anexos-ir2.service';
import { ReporteDgii } from './entities/reporte-dgii.entity';
import { Factura } from '../facturas/entities/factura.entity';
import { FacturaDetalle } from '../facturas/entities/factura-detalle.entity';
import { Compra } from '../compras/entities/compra.entity';
import { CompraDetalle } from '../compras/entities/compra-detalle.entity';
import { Gasto } from '../gastos/entities/gasto.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Factura, FacturaDetalle, Compra, CompraDetalle, ReporteDgii, Gasto])],
  controllers: [DeclaracionesController],
  providers:   [DeclaracionesService, DeclaracionesPdfService, DgiiValidatorService, DgiiTxtGeneratorService, ConciliacionFiscalService, AnexosIR2Service],
  exports:     [DeclaracionesService, ConciliacionFiscalService, AnexosIR2Service],
})
export class DeclaracionesModule {}
