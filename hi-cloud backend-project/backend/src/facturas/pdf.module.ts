import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PDFService } from './services/pdf.service';
import { NumeroLetrasService } from './services/numero-letras.service';
import { Factura } from './entities/factura.entity';
import { TenantModule } from '../tenant/tenant.module';

/**
 * PdfModule — módulo aislado para generación de PDFs de facturas.
 * Se extrae de FacturasModule para evitar dependencias circulares
 * cuando NotificacionesModule necesita adjuntar PDFs a los correos.
 *
 * Dependencias directas: TypeOrm[Factura], TenantModule, NumeroLetrasService.
 * NO importa SuscripcionesModule ni NotificacionesModule.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Factura]),
    TenantModule,
  ],
  providers: [PDFService, NumeroLetrasService],
  exports: [PDFService],
})
export class PdfModule {}
