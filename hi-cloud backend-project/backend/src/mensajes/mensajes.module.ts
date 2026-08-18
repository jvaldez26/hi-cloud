import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Mensaje }        from './entities/mensaje.entity';
import { MensajeLectura } from './entities/mensaje-lectura.entity';
import { MensajesService } from './mensajes.service';
import { MensajesController, MensajesAdminController } from './mensajes.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Mensaje, MensajeLectura])],
  controllers: [MensajesController, MensajesAdminController],
  providers:   [MensajesService],
  exports:     [MensajesService],
})
export class MensajesModule {}
