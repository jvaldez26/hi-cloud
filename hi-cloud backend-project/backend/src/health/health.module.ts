import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HealthController } from './health.controller';
import { TenantModule } from '../tenant/tenant.module';
import { QueuesModule } from '../queues/queues.module';
import { UsuarioEmpresa } from '../multi-empresa/entities/usuario-empresa.entity';

@Module({
  imports:     [TenantModule, QueuesModule, TypeOrmModule.forFeature([UsuarioEmpresa])],
  controllers: [HealthController],
})
export class HealthModule {}
