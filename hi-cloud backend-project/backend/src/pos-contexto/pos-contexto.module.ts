import { Module } from '@nestjs/common';
import { PosContextoController } from './pos-contexto.controller';
import { RestauranteModule } from '../restaurante/restaurante.module';
import { TallerModule } from '../taller/taller.module';
import { OpticaModule } from '../optica/optica.module';

@Module({
  imports: [RestauranteModule, TallerModule, OpticaModule],
  controllers: [PosContextoController],
})
export class PosContextoModule {}
