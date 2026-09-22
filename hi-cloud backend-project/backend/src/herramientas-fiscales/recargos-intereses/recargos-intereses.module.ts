import { Module } from '@nestjs/common';
import { ParametrosFiscalesModule } from '../../parametros-fiscales/parametros-fiscales.module';
import { RecargosInteresesService } from './recargos-intereses.service';
import { RecargosInteresesController } from './recargos-intereses.controller';

@Module({
  imports: [ParametrosFiscalesModule],
  controllers: [RecargosInteresesController],
  providers: [RecargosInteresesService],
  // Exportado para que DeclaracionesModule reuse este motor en IT-1 (Sección
  // IV Penalidades) en vez de duplicar la aritmética de recargos/interés.
  exports: [RecargosInteresesService],
})
export class RecargosInteresesModule {}
