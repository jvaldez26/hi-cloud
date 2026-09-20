import { Module } from '@nestjs/common';
import { ParametrosFiscalesModule } from '../../parametros-fiscales/parametros-fiscales.module';
import { ProporcionalidadItbisService } from './proporcionalidad-itbis.service';
import { ProporcionalidadItbisController } from './proporcionalidad-itbis.controller';

@Module({
  imports: [ParametrosFiscalesModule],
  controllers: [ProporcionalidadItbisController],
  providers: [ProporcionalidadItbisService],
})
export class ProporcionalidadItbisModule {}
