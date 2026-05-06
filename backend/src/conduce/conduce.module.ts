import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConduceController } from './conduce.controller';
import { ConduceService } from './conduce.service';
import { Conduce } from './entities/conduce.entity';
import { ConduceDetalle } from './entities/conduce-detalle.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Conduce, ConduceDetalle])],
  controllers: [ConduceController],
  providers: [ConduceService],
  exports: [ConduceService],
})
export class ConduceModule {}
