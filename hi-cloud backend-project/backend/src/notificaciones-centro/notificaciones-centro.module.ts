import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificacionesCentroController } from './notificaciones-centro.controller';
import { NotificacionesCentroService } from './notificaciones-centro.service';
import { AlertaVista } from './entities/alerta-vista.entity';
import { NotificacionEnviada } from '../notificaciones/entities/notificacion-enviada.entity';
import { User } from '../users/users.entity';
import { AlertasSistemaModule } from '../alertas-sistema/alertas-sistema.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([AlertaVista, NotificacionEnviada, User]),
    AlertasSistemaModule,
  ],
  controllers: [NotificacionesCentroController],
  providers: [NotificacionesCentroService],
  exports: [NotificacionesCentroService],
})
export class NotificacionesCentroModule {}
