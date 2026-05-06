import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PreciosService } from './precios.service';
import { PreciosController } from './precios.controller';
import { PrecioEspecial } from './entities/precio-especial.entity';

@Module({
  imports: [TypeOrmModule.forFeature([PrecioEspecial])],
  controllers: [PreciosController],
  providers: [PreciosService],
  exports: [PreciosService],
})
export class PreciosModule {}
