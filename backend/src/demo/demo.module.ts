import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { DemoService } from './demo.service';
import { DemoController } from './demo.controller';
import { DemoRequest } from './entities/demo-request.entity';

@Module({
  imports: [TypeOrmModule.forFeature([DemoRequest]), ConfigModule],
  controllers: [DemoController],
  providers: [DemoService],
  exports: [DemoService],
})
export class DemoModule {}
