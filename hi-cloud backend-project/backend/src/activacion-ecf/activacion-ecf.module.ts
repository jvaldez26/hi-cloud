import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SolicitudActivacionEcf } from './entities/solicitud-activacion-ecf.entity';
import { ActivacionEcfService } from './activacion-ecf.service';
import { CertificadoPfxService } from './certificado-pfx.service';
import { IntentosCertificadoService } from './intentos-certificado.service';
import { ActivacionEcfController, ActivacionEcfAdminController } from './activacion-ecf.controller';
import { S3Module } from '../common/s3/s3.module';
import { SuperAdminModule } from '../super-admin/super-admin.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([SolicitudActivacionEcf]),
    S3Module,
    // Aporta SuperAdminGuard al controlador de plataforma.
    SuperAdminModule,
  ],
  controllers: [ActivacionEcfController, ActivacionEcfAdminController],
  providers:   [ActivacionEcfService, CertificadoPfxService, IntentosCertificadoService],
  exports:     [ActivacionEcfService],
})
export class ActivacionEcfModule {}
