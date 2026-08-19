import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Mensaje }        from './entities/mensaje.entity';
import { MensajeLectura } from './entities/mensaje-lectura.entity';
import { MensajesService } from './mensajes.service';
import { MensajesController, MensajesAdminController } from './mensajes.controller';
import { SuperAdminModule } from '../super-admin/super-admin.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Mensaje, MensajeLectura]),
    // SuperAdminModule exporta SuperAdminGuard, JwtModule y TokenBlacklistService
    // — necesarios para los endpoints de administración del MensajesAdminController
    SuperAdminModule,
  ],
  controllers: [MensajesController, MensajesAdminController],
  providers:   [MensajesService],
  exports:     [MensajesService],
})
export class MensajesModule {}
