import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProFormaService } from './pro-forma.service';
import { ProFormaController } from './pro-forma.controller';
import { ProForma } from './entities/pro-forma.entity';
import { ProFormaItem } from './entities/pro-forma-item.entity';
import { TenantModule } from '../tenant/tenant.module';

@Module({
  imports: [TypeOrmModule.forFeature([ProForma, ProFormaItem]), TenantModule],
  controllers: [ProFormaController],
  providers: [ProFormaService],
  exports: [ProFormaService],
})
export class ProFormaModule {}
