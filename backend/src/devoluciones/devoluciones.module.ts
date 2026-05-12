import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DevolucionesService } from './devoluciones.service';
import { DevolucionesController } from './devoluciones.controller';
import { Devolucion } from './entities/devolucion.entity';
import { DevolucionDetalle } from './entities/devolucion-detalle.entity';
import { Factura } from '../facturas/entities/factura.entity';
import { NotaCredito } from '../notas-credito/entities/nota-credito.entity';
import { NotaCreditoDetalle } from '../notas-credito/entities/nota-credito-detalle.entity';
import { InventarioModule } from '../inventario/inventario.module';
import { ContabilidadModule } from '../contabilidad/contabilidad.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Devolucion, DevolucionDetalle, Factura,
      NotaCredito, NotaCreditoDetalle,
    ]),
    InventarioModule,
    ContabilidadModule,
  ],
  controllers: [DevolucionesController],
  providers: [DevolucionesService],
  exports: [DevolucionesService],
})
export class DevolucionesModule {}
