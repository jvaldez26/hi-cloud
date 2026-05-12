import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChequesController } from './cheques.controller';
import { ChequesService } from './cheques.service';
import { Chequera } from './entities/chequera.entity';
import { Cheque } from './entities/cheque.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Chequera, Cheque])],
  controllers: [ChequesController],
  providers: [ChequesService],
  exports: [ChequesService],
})
export class ChequesModule {}
