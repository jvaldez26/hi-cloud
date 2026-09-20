import { Module } from '@nestjs/common';
import { RecargosInteresesModule } from './recargos-intereses/recargos-intereses.module';
import { ImpuestosAPagarModule } from './impuestos-a-pagar/impuestos-a-pagar.module';
import { AnticiposISRModule } from './anticipos-isr/anticipos-isr.module';

/**
 * Agrupa las 5 calculadoras de Herramientas Fiscales — cada una, un
 * submódulo propio (Commit 2: recargos-intereses; Commit 3: impuestos-a-
 * pagar; Commit 4: anticipos-isr; Commits 5-6 se agregan aquí). Ninguna
 * calcula por sí sola: todas delegan la aritmética en una función pura y
 * leen los parámetros vigentes de ParametrosFiscalesService.
 */
@Module({
  imports: [RecargosInteresesModule, ImpuestosAPagarModule, AnticiposISRModule],
})
export class HerramientasFiscalesModule {}
