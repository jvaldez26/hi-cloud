import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CajaChicaController } from './caja-chica.controller';
import { CajaChicaService } from './caja-chica.service';
import { CajaChica } from './entities/caja-chica.entity';
import { MovimientoCajaChica } from './entities/movimiento-caja-chica.entity';

@Module({
  imports: [TypeOrmModule.forFeature([CajaChica, MovimientoCajaChica])],
  controllers: [CajaChicaController],
  providers: [CajaChicaService],
  exports: [CajaChicaService],
})
export class CajaChicaModule {}
