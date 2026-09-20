import { Module } from '@nestjs/common';
import { ParametrosFiscalesModule } from '../../parametros-fiscales/parametros-fiscales.module';
import { AjusteInflacionService } from './ajuste-inflacion.service';
import { AjusteInflacionController } from './ajuste-inflacion.controller';

@Module({
  imports: [ParametrosFiscalesModule],
  controllers: [AjusteInflacionController],
  providers: [AjusteInflacionService],
})
export class AjusteInflacionModule {}
