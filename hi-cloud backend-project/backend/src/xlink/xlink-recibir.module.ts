import { Module } from '@nestjs/common';
import { XlinkModule } from './xlink.module';
import { XlinkRecibirService } from './xlink-recibir.service';
import { XlinkMapeosService } from './xlink-mapeos.service';
import { XlinkRecibirController } from './xlink-recibir.controller';
import { ComprasModule } from '../compras/compras.module';
import { CotizacionesModule } from '../cotizaciones/cotizaciones.module';
import { NotasCreditoComprasModule } from '../notas-credito-compras/notas-credito-compras.module';
import { NotasCreditoModule } from '../notas-credito/notas-credito.module';
import { FacturasModule } from '../facturas/facturas.module';
import { ProductosModule } from '../productos/productos.module';

/**
 * Módulo SEPARADO de XlinkModule a propósito: ComprasModule/FacturasModule/
 * NotasCreditoModule ya importan XlinkModule (para el gancho de anulación
 * TIPO B de Fase 3) — si este módulo también se llamara XlinkModule e
 * importara ComprasModule, sería un ciclo. Aquí es al revés (este módulo
 * importa a los otros), así que no hay conflicto: XlinkRecibirModule →
 * {Compras, Cotizaciones, NotasCreditoCompras, NotasCredito, Facturas,
 * Productos} → ... → XlinkModule, nunca de vuelta a XlinkRecibirModule.
 */
@Module({
  imports: [
    XlinkModule,
    ComprasModule,
    CotizacionesModule,
    NotasCreditoComprasModule,
    NotasCreditoModule,
    FacturasModule,
    ProductosModule,
  ],
  controllers: [XlinkRecibirController],
  providers: [XlinkRecibirService, XlinkMapeosService],
})
export class XlinkRecibirModule {}
