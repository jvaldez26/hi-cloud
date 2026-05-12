import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InvitacionesController } from './invitaciones.controller';
import { InvitacionesService } from './invitaciones.service';
import { Invitacion } from './entities/invitacion.entity';
import { User } from '../users/users.entity';
import { UsuarioEmpresa } from '../multi-empresa/entities/usuario-empresa.entity';
import { Empresa } from '../configuracion/entities/empresa.entity';
import { NotificacionesModule } from '../notificaciones/notificaciones.module';
import { SuscripcionesModule } from '../suscripciones/suscripciones.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Invitacion, User, UsuarioEmpresa, Empresa]),
    NotificacionesModule,
    SuscripcionesModule,
  ],
  controllers: [InvitacionesController],
  providers:   [InvitacionesService],
  exports:     [InvitacionesService],
})
export class InvitacionesModule {}
