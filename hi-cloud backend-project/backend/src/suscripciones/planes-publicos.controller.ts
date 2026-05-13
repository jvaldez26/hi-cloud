import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { SuscripcionesService } from './suscripciones.service';

/** Endpoint público para la landing page — sin autenticación */
@ApiTags('Planes Públicos')
@Controller('public/planes')
export class PlanesPublicosController {
  constructor(private readonly svc: SuscripcionesService) {}

  @Get()
  @ApiOperation({ summary: 'Catálogo de planes para la landing page (sin auth)' })
  getPlanes() {
    return this.svc.getPlanesCatalogo();
  }
}
