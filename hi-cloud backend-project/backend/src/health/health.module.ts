import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { TenantModule } from '../tenant/tenant.module';
import { QueuesModule } from '../queues/queues.module';

@Module({
  imports:     [TenantModule, QueuesModule],
  controllers: [HealthController],
})
export class HealthModule {}
