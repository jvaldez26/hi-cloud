import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MultiEmpresaService } from './multi-empresa.service';
import { MultiEmpresaController } from './multi-empresa.controller';
import { UsuarioEmpresa } from './entities/usuario-empresa.entity';
import { Empresa } from '../configuracion/entities/empresa.entity';
import { Sucursal } from '../configuracion/entities/sucursal.entity';
import { User } from '../users/users.entity';
import { ContabilidadModule } from '../contabilidad/contabilidad.module';
import { NotificacionesModule } from '../notificaciones/notificaciones.module';
import { SuperAdminModule } from '../super-admin/super-admin.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([UsuarioEmpresa, Empresa, Sucursal, User]),
    ContabilidadModule,
    NotificacionesModule,
    // S-61: provee SuperAdminGuard (+ JwtModule y TokenBlacklistService) para
    // GET /multi-empresa/resumen, que es función de plataforma.
    SuperAdminModule,
  ],
  controllers: [MultiEmpresaController],
  providers: [MultiEmpresaService],
  exports: [MultiEmpresaService],
})
export class MultiEmpresaModule {}
