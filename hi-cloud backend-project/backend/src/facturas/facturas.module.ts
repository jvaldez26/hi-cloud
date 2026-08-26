import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FacturasService } from './facturas.service';
import { FacturasController } from './facturas.controller';
import { PdfModule } from './pdf.module';
import { Factura } from './entities/factura.entity';
import { FacturaDetalle } from './entities/factura-detalle.entity';
import { ClientesModule } from '../clientes/clientes.module';
import { ProductosModule } from '../productos/productos.module';
import { InventarioModule } from '../inventario/inventario.module';
import { ECFModule } from '../ecf/ecf.module';
import { CxCModule } from '../cxc/cxc.module';
import { ContabilidadModule } from '../contabilidad/contabilidad.module';
import { SuscripcionesModule } from '../suscripciones/suscripciones.module';
import { CajaModule } from '../caja/caja.module';
import { RncModule } from '../rnc/rnc.module';
import { VendedorResolverModule } from './vendedor/vendedor-resolver.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Factura, FacturaDetalle]),
    ClientesModule, ProductosModule, InventarioModule,
    ECFModule, CxCModule, ContabilidadModule,
    SuscripcionesModule, CajaModule, RncModule,
    VendedorResolverModule,
    PdfModule,           // PDFService + NumeroLetrasService encapsulados aquí
  ],
  controllers: [FacturasController],
  providers: [FacturasService],
  exports: [FacturasService, PdfModule],  // re-exporta PdfModule → PDFService disponible para importadores
})
export class FacturasModule {}
