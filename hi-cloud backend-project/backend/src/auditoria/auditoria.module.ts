import { Module } from '@nestjs/common';
import { SuscripcionesModule } from '../suscripciones/suscripciones.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditoriaService } from './auditoria.service';
import { AuditoriaController } from './auditoria.controller';
import { AuditLog } from './entities/audit-log.entity';
import { TenantModule } from '../tenant/tenant.module';

@Module({
  imports: [SuscripcionesModule, TenantModule, TypeOrmModule.forFeature([AuditLog])],
  controllers: [AuditoriaController],
  providers: [AuditoriaService],
  exports: [AuditoriaService],
})
export class AuditoriaModule {}
