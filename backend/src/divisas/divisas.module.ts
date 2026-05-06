import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DivisasController } from './divisas.controller';
import { DivisasService } from './divisas.service';
import { TasaCambio } from './entities/tasa-cambio.entity';

@Module({
  imports: [TypeOrmModule.forFeature([TasaCambio])],
  controllers: [DivisasController],
  providers: [DivisasService],
  exports: [DivisasService],
})
export class DivisasModule {}
