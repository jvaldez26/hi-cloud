import { Module } from '@nestjs/common';
import { ParametrosFiscalesModule } from '../../parametros-fiscales/parametros-fiscales.module';
import { ImpuestosAPagarService } from './impuestos-a-pagar.service';
import { ImpuestosAPagarController } from './impuestos-a-pagar.controller';

@Module({
  imports: [ParametrosFiscalesModule],
  controllers: [ImpuestosAPagarController],
  providers: [ImpuestosAPagarService],
})
export class ImpuestosAPagarModule {}
