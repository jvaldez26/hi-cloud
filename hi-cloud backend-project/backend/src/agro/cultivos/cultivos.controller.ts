import { Controller, Get, Post, Patch, Body, Param, ParseIntPipe, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../tenant/tenant.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../users/enums/user-role.enum';
import { ModuloAddonGuard } from '../../modulos-addon/guards/modulo-addon.guard';
import { TenantService } from '../../tenant/tenant.service';
import { CultivosService } from './cultivos.service';
import { CrearCultivoDto, ActualizarCultivoDto } from '../dto/agro.dto';

@Controller('agro/cultivos')
@UseGuards(JwtAuthGuard, RolesGuard, TenantGuard, ModuloAddonGuard('agro'))
export class CultivosController {
  constructor(private readonly svc: CultivosService, private readonly tenantSvc: TenantService) {}
  private get empresaId() { return this.tenantSvc.getEmpresaId(); }

  @Get()        @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR, UserRole.VIEWER)
  findAll()                                       { return this.svc.findAll(this.empresaId); }
  @Post()       @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR)
  create(@Body() body: CrearCultivoDto)                       { return this.svc.create(this.empresaId, body); }
  @Patch(':id') @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR)
  update(@Param('id', ParseIntPipe) id: number, @Body() body: ActualizarCultivoDto) { return this.svc.update(this.empresaId, id, body); }
}
