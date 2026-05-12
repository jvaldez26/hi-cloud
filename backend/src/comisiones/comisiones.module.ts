import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ComisionesService } from './comisiones.service';
import { ComisionesController } from './comisiones.controller';
import { Comision } from './entities/comision.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Comision])],
  controllers: [ComisionesController],
  providers: [ComisionesService],
  exports: [ComisionesService],
})
export class ComisionesModule {}
