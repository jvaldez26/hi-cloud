import { SetMetadata } from '@nestjs/common';
import { MODULO_KEY } from '../guards/plan.guard';

/**
 * Indica el módulo de plan requerido para acceder al controlador o ruta.
 * El PlanGuard lanzará 403 si el plan activo no incluye este módulo.
 *
 * @example
 * @RequiereModulo('contabilidad')
 * @Controller('contabilidad')
 * export class ContabilidadController { ... }
 */
export const RequiereModulo = (modulo: string) => SetMetadata(MODULO_KEY, modulo);
