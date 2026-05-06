import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AsistenteService } from './asistente.service';
import { AsistenteController } from './asistente.controller';
import { TenantModule } from '../tenant/tenant.module';

@Module({
  imports: [ConfigModule, TenantModule],
  controllers: [AsistenteController],
  providers: [AsistenteService],
  exports: [AsistenteService],
})
export class AsistenteModule {}
