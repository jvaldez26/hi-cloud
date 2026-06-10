import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ModulosAddonService } from './modulos-addon.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../tenant/tenant.guard';

@ApiTags('Módulos Add-on')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, TenantGuard)
@Controller('modulos')
export class ModulosAddonController {
  constructor(private readonly svc: ModulosAddonService) {}

  @Get()
  @ApiOperation({ summary: 'Listar todos los módulos add-on disponibles' })
  listar() {
    return this.svc.listarModulos();
  }

  @Get('check/:codigo')
  @ApiOperation({ summary: 'Verificar si la empresa actual tiene activo un módulo add-on' })
  async check(@Param('codigo') codigo: string) {
    const activo = await this.svc.checkModuloActivoCurrentEmpresa(codigo);
    return { codigo, activo };
  }
}
