import { Module } from '@nestjs/common';
import { ParametrosFiscalesModule } from '../../parametros-fiscales/parametros-fiscales.module';
import { ProporcionalidadItbisService } from './proporcionalidad-itbis.service';
import { ProporcionalidadItbisController } from './proporcionalidad-itbis.controller';

@Module({
  imports: [ParametrosFiscalesModule],
  controllers: [ProporcionalidadItbisController],
  providers: [ProporcionalidadItbisService],
  // Exportado para que AnexoAService (Sección IX del Anexo A del IT-1)
  // reuse este motor en vez de duplicar la aritmética de proporcionalidad.
  exports: [ProporcionalidadItbisService],
})
export class ProporcionalidadItbisModule {}
