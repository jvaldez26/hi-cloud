import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DescuentosController } from './descuentos.controller';
import { DescuentosService } from './descuentos.service';
import { ReglaDescuento } from './entities/regla-descuento.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ReglaDescuento])],
  controllers: [DescuentosController],
  providers: [DescuentosService],
  exports: [DescuentosService],
})
export class DescuentosModule {}
