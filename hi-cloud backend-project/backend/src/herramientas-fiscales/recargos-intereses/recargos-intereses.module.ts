import { Module } from '@nestjs/common';
import { ParametrosFiscalesModule } from '../../parametros-fiscales/parametros-fiscales.module';
import { RecargosInteresesService } from './recargos-intereses.service';
import { RecargosInteresesController } from './recargos-intereses.controller';

@Module({
  imports: [ParametrosFiscalesModule],
  controllers: [RecargosInteresesController],
  providers: [RecargosInteresesService],
})
export class RecargosInteresesModule {}
