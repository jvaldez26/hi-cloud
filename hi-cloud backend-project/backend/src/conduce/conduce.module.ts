import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConduceController } from './conduce.controller';
import { ConduceService } from './conduce.service';
import { ConducePDFService } from './conduce-pdf.service';
import { Conduce } from './entities/conduce.entity';
import { ConduceDetalle } from './entities/conduce-detalle.entity';
import { BrowserService } from '../common/services/browser.service';

@Module({
  imports: [TypeOrmModule.forFeature([Conduce, ConduceDetalle])],
  controllers: [ConduceController],
  providers: [ConduceService, ConducePDFService, BrowserService],
  exports: [ConduceService],
})
export class ConduceModule {}
