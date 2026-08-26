import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PreFacturaController } from './pre-factura.controller';
import { PreFacturaService } from './pre-factura.service';
import { PreFacturaPDFService } from './pre-factura-pdf.service';
import { PreFactura } from './entities/pre-factura.entity';
import { PreFacturaDetalle } from './entities/pre-factura-detalle.entity';
import { Factura } from '../facturas/entities/factura.entity';
import { FacturasModule } from '../facturas/facturas.module';
import { VendedorResolverModule } from '../facturas/vendedor/vendedor-resolver.module';

@Module({
  imports: [TypeOrmModule.forFeature([PreFactura, PreFacturaDetalle, Factura]), FacturasModule, VendedorResolverModule],
  controllers: [PreFacturaController],
  providers: [PreFacturaService, PreFacturaPDFService],
  exports: [PreFacturaService],
})
export class PreFacturaModule {}
