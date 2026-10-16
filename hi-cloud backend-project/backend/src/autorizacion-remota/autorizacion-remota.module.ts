import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SolicitudAutorizacionRemota } from './entities/solicitud-autorizacion-remota.entity';
import { AutorizacionRemotaService } from './autorizacion-remota.service';
import { AutorizacionRemotaController } from './autorizacion-remota.controller';
import { SupervisorPoliticasModule } from '../supervisor-politicas/supervisor-politicas.module';
import { NotificacionesModule } from '../notificaciones/notificaciones.module';
import { AuditoriaModule } from '../auditoria/auditoria.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([SolicitudAutorizacionRemota]),
    SupervisorPoliticasModule, // SupervisorPoliticaService — permiteRemoto/requerido de la clave pedida
    NotificacionesModule,      // NotificacionesService (campanita) + PushService (push PWA)
    AuditoriaModule,
  ],
  controllers: [AutorizacionRemotaController],
  providers: [AutorizacionRemotaService],
  exports: [AutorizacionRemotaService],
})
export class AutorizacionRemotaModule {}
