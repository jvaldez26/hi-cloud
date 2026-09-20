import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ParametroFiscal } from './entities/parametro-fiscal.entity';
import { ParametrosFiscalesService } from './parametros-fiscales.service';
import { ParametrosFiscalesController } from './parametros-fiscales.controller';
import { AuditoriaModule } from '../auditoria/auditoria.module';
import { SuperAdminModule } from '../super-admin/super-admin.module';

@Module({
  // SuperAdminModule: el controller usa SuperAdminGuard, que necesita
  // JwtService/TokenBlacklistService — SuperAdminModule los exporta junto
  // con el guard (ver el mismo patrón en PagosSuscripcionModule). Sin esto
  // Nest no puede resolver las dependencias del guard al arrancar.
  imports: [TypeOrmModule.forFeature([ParametroFiscal]), AuditoriaModule, SuperAdminModule],
  controllers: [ParametrosFiscalesController],
  providers: [ParametrosFiscalesService],
  exports: [ParametrosFiscalesService],
})
export class ParametrosFiscalesModule {}
