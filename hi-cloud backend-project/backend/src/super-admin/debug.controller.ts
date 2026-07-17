import { Controller, Get, UseGuards } from '@nestjs/common';
import { SuperAdminGuard } from './super-admin.guard';

/**
 * TEMPORAL — eliminar tras verificar que los errores llegan a Sentry + scrubbing OK.
 * Protegido por SuperAdminGuard: solo role=SUPER_ADMIN puede acceder.
 */
@UseGuards(SuperAdminGuard)
@Controller('debug')
export class DebugController {
  @Get('sentry-test')
  sentryTest(): never {
    throw new Error('SENTRY TEST scrubbing - ' + Date.now());
  }
}
