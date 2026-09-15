import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ModulosAddonService } from './modulos-addon.service';

/**
 * Endpoint público — sin auth, solo para el selector de sector del
 * registro (RegisterPage.tsx). Deliberadamente en un controller aparte de
 * ModulosAddonController, que trae @UseGuards(JwtAuthGuard, TenantGuard) a
 * nivel de clase — mismo patrón que RncController separa `/rnc/publico`.
 */
@ApiTags('Módulos Add-on')
@Controller('modulos/publico')
export class ModulosAddonPublicoController {
  constructor(private readonly svc: ModulosAddonService) {}

  @Get()
  @ApiOperation({ summary: 'Catálogo de add-ons activos — sin autenticación, para el registro' })
  listar() {
    return this.svc.listarModulos();
  }
}
