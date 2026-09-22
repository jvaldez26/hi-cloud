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
import { DeclaracionItbis } from './entities/declaracion-itbis.entity';
import { Factura } from '../facturas/entities/factura.entity';
import { FacturaDetalle } from '../facturas/entities/factura-detalle.entity';
import { Compra } from '../compras/entities/compra.entity';
import { CompraDetalle } from '../compras/entities/compra-detalle.entity';
import { Gasto } from '../gastos/entities/gasto.entity';
import { RecargosInteresesModule } from '../herramientas-fiscales/recargos-intereses/recargos-intereses.module';
import { ProporcionalidadItbisModule } from '../herramientas-fiscales/proporcionalidad-itbis/proporcionalidad-itbis.module';
import { AnexoAService } from './anexo-a.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Factura, FacturaDetalle, Compra, CompraDetalle, ReporteDgii, DeclaracionItbis, Gasto]),
    RecargosInteresesModule,
    ProporcionalidadItbisModule,
  ],
  controllers: [DeclaracionesController],
  providers:   [DeclaracionesService, DeclaracionesPdfService, DgiiValidatorService, DgiiTxtGeneratorService, ConciliacionFiscalService, AnexosIR2Service, AnexoAService],
  exports:     [DeclaracionesService, ConciliacionFiscalService, AnexosIR2Service, AnexoAService],
})
export class DeclaracionesModule {}
