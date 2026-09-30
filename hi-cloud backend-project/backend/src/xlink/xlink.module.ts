import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { XlinkDocumento } from './entities/xlink-documento.entity';
import { XlinkMapeo } from './entities/xlink-mapeo.entity';
import { XlinkDocumentosRepository } from './xlink-documentos.repository';
import { XlinkService } from './xlink.service';
import { XlinkPublicarService } from './xlink-publicar.service';
import { XlinkController } from './xlink.controller';
import { XlinkDirectorioThrottlerGuard } from './guards/xlink-directorio-throttler.guard';
import { Empresa } from '../configuracion/entities/empresa.entity';
import { SuscripcionesModule } from '../suscripciones/suscripciones.module';
import { AuditoriaModule } from '../auditoria/auditoria.module';
import { ProveedoresModule } from '../proveedores/proveedores.module';
import { ClientesModule } from '../clientes/clientes.module';
import { NotificacionesModule } from '../notificaciones/notificaciones.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([XlinkDocumento, XlinkMapeo, Empresa]),
    SuscripcionesModule,
    AuditoriaModule,
    ProveedoresModule,
    ClientesModule,
    NotificacionesModule,
  ],
  controllers: [XlinkController],
  providers: [XlinkDocumentosRepository, XlinkService, XlinkPublicarService, XlinkDirectorioThrottlerGuard],
  exports: [XlinkDocumentosRepository, XlinkService, XlinkPublicarService],
})
export class XlinkModule {}
