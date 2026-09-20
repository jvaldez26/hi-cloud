import { Module } from '@nestjs/common';
import { RecargosInteresesModule } from './recargos-intereses/recargos-intereses.module';

/**
 * Agrupa las 5 calculadoras de Herramientas Fiscales — cada una, un
 * submódulo propio (Commit 2: recargos-intereses; Commits 3-6 se agregan
 * aquí). Ninguna calcula por sí sola: todas delegan la aritmética en una
 * función pura y leen los parámetros vigentes de ParametrosFiscalesService.
 */
@Module({
  imports: [RecargosInteresesModule],
})
export class HerramientasFiscalesModule {}
