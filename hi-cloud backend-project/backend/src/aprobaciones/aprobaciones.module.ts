import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AprobacionesController } from './aprobaciones.controller';
import { AprobacionesService } from './aprobaciones.service';
import { Aprobacion } from './entities/aprobacion.entity';
import { NotificacionesModule } from '../notificaciones/notificaciones.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Aprobacion]),
    NotificacionesModule,
  ],
  controllers: [AprobacionesController],
  providers: [AprobacionesService],
  exports: [AprobacionesService],
})
export class AprobacionesModule {}
