import { Controller, Get, Res } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import type { Response } from 'express';

// Leídos UNA VEZ al arrancar el proceso — inmutables durante el ciclo de vida.
// No se recalculan por request; no tocan DB ni Redis.
const BUILD_ID   = process.env.SENTRY_RELEASE ?? null;
const APP_VERSION = process.env.npm_package_version ?? '1.0.0';
const STARTED_AT  = new Date().toISOString();

/**
 * GET /api/v1/version
 *
 * Endpoint liviano para el NewVersionBanner del frontend.
 * Público — sin autenticación, sin tenant, sin DB, sin Redis.
 * Cache-Control: no-store para que el navegador nunca sirva la respuesta en caché.
 *
 * El frontend compara build_id con el VITE_SENTRY_RELEASE embebido en el bundle.
 * Cuando difieren → hay un deploy nuevo → se muestra la notificación de recarga.
 */
@ApiTags('Version')
@Controller('version')
export class VersionController {
  @Get()
  @ApiOperation({ summary: 'Versión del build activo — público, sin DB (uso del NewVersionBanner)' })
  version(@Res({ passthrough: true }) res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    return {
      build_id:   BUILD_ID,
      version:    APP_VERSION,
      env:        process.env.NODE_ENV ?? 'development',
      startedAt:  STARTED_AT,
    };
  }
}
