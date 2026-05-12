import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UomService } from './uom.service';
import { UomController } from './uom.controller';
import { UnidadMedida } from './entities/unidad-medida.entity';
import { ConversionUom } from './entities/conversion-uom.entity';

@Module({
  imports: [TypeOrmModule.forFeature([UnidadMedida, ConversionUom])],
  controllers: [UomController],
  providers: [UomService],
  exports: [UomService],
})
export class UomModule {}
