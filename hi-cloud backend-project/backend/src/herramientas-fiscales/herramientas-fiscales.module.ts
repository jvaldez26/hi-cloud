import { Module } from '@nestjs/common';
import { RecargosInteresesModule } from './recargos-intereses/recargos-intereses.module';
import { ImpuestosAPagarModule } from './impuestos-a-pagar/impuestos-a-pagar.module';

/**
 * Agrupa las 5 calculadoras de Herramientas Fiscales — cada una, un
 * submódulo propio (Commit 2: recargos-intereses; Commit 3: impuestos-a-
 * pagar; Commits 4-6 se agregan aquí). Ninguna calcula por sí sola: todas
 * delegan la aritmética en una función pura y leen los parámetros vigentes
 * de ParametrosFiscalesService.
 */
@Module({
  imports: [RecargosInteresesModule, ImpuestosAPagarModule],
})
export class HerramientasFiscalesModule {}
