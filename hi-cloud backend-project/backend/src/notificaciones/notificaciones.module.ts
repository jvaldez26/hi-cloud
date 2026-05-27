import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { NotificacionesService } from './notificaciones.service';
import { NotificacionesController } from './notificaciones.controller';
import { EmailService } from './services/email.service';
import { WhatsAppService } from './services/whatsapp.service';
import { NotificacionEnviada } from './entities/notificacion-enviada.entity';
import { PushService, PushSubscription } from './push.service';
import { PushController } from './push.controller';
import { TenantModule } from '../tenant/tenant.module';
import { PdfModule } from '../facturas/pdf.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([NotificacionEnviada, PushSubscription]),
    ConfigModule,
    TenantModule,
    PdfModule,   // permite adjuntar PDF al enviar facturas por email (sin dep circular)
  ],
  controllers: [NotificacionesController, PushController],
  providers: [NotificacionesService, EmailService, WhatsAppService, PushService],
  exports: [NotificacionesService, EmailService, PushService],
})
export class NotificacionesModule {}
