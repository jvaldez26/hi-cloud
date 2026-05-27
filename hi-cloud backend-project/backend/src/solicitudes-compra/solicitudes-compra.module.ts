import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SolicitudesCompraService } from './solicitudes-compra.service';
import { SolicitudesCompraController } from './solicitudes-compra.controller';
import { SolicitudCompra } from './entities/solicitud-compra.entity';
import { SolicitudCompraLinea } from './entities/solicitud-compra-linea.entity';
import { CotizacionProveedor } from './entities/cotizacion-proveedor.entity';
import { CotizacionProveedorLinea } from './entities/cotizacion-proveedor-linea.entity';
import { NotificacionesModule } from '../notificaciones/notificaciones.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SolicitudCompra,
      SolicitudCompraLinea,
      CotizacionProveedor,
      CotizacionProveedorLinea,
    ]),
    NotificacionesModule,
  ],
  controllers: [SolicitudesCompraController],
  providers: [SolicitudesCompraService],
  exports: [SolicitudesCompraService],
})
export class SolicitudesCompraModule {}
