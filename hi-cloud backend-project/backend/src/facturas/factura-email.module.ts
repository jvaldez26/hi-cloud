import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { FacturaEmailService } from './services/factura-email.service';
import { Factura } from './entities/factura.entity';
import { PdfModule } from './pdf.module';
import { EmailService } from '../notificaciones/services/email.service';

/**
 * Envío de facturas por correo, aislado igual que PdfModule y por la misma
 * razón: lo necesitan tanto FacturasModule (el botón de reenviar) como
 * FacturasRecurrentesModule (el envío automático), y ninguno de los dos puede
 * depender del otro.
 *
 * EmailService se provee aquí directamente —sólo depende de ConfigService— en
 * vez de importar NotificacionesModule, que arrastraría el ciclo que PdfModule
 * ya evita.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Factura]),
    ConfigModule,
    PdfModule,
  ],
  providers: [FacturaEmailService, EmailService],
  exports:   [FacturaEmailService],
})
export class FacturaEmailModule {}
