import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FacturasService } from './facturas.service';
import { FacturasController } from './facturas.controller';
import { PDFService } from './services/pdf.service';
import { NumeroLetrasService } from './services/numero-letras.service';
import { Factura } from './entities/factura.entity';
import { FacturaDetalle } from './entities/factura-detalle.entity';
import { ClientesModule } from '../clientes/clientes.module';
import { ProductosModule } from '../productos/productos.module';
import { InventarioModule } from '../inventario/inventario.module';
import { ECFModule } from '../ecf/ecf.module';
import { CxCModule } from '../cxc/cxc.module';
import { ContabilidadModule } from '../contabilidad/contabilidad.module';
import { SuscripcionesModule } from '../suscripciones/suscripciones.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Factura, FacturaDetalle]),
    ClientesModule, ProductosModule, InventarioModule,
    ECFModule, CxCModule, ContabilidadModule,
    SuscripcionesModule,
  ],
  controllers: [FacturasController],
  providers: [FacturasService, PDFService, NumeroLetrasService],
  exports: [FacturasService, PDFService],
})
export class FacturasModule {}
