import { Controller, Get } from '@nestjs/common';

/**
 * TEMPORAL — eliminar INMEDIATAMENTE tras verificar que el error llega a Sentry.
 * Sin autenticación por diseño: solo lanza un Error de prueba (sin datos ni efectos).
 * Vida útil: ~10 min.
 */
@Controller('debug')
export class DebugController {
  @Get('sentry-test')
  sentryTest(): never {
    throw new Error('SENTRY TEST scrubbing - ' + Date.now());
  }
}
