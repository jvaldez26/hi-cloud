import { Controller, Get, Post, Patch, Body, Param, ParseIntPipe, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../tenant/tenant.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../users/enums/user-role.enum';
import { ModuloAddonGuard } from '../../modulos-addon/guards/modulo-addon.guard';
import { TenantService } from '../../tenant/tenant.service';
import { CiclosService } from './ciclos.service';
import {
  CrearCicloDto, ActualizarCicloDto, CerrarCicloDto,
  CrearLaborDto, ActualizarLaborDto,
  CrearAplicacionDto,
} from '../dto/agro.dto';

@Controller('agro/ciclos')
@UseGuards(JwtAuthGuard, RolesGuard, TenantGuard, ModuloAddonGuard('agro'))
export class CiclosController {
  constructor(private readonly svc: CiclosService, private readonly tenantSvc: TenantService) {}
  private get empresaId() { return this.tenantSvc.getEmpresaId(); }

  @Get()        @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR, UserRole.VIEWER)
  findAll(@Query() q: any)   { return this.svc.findAll(this.empresaId, q); }
  @Post()       @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR)
  create(@Body() body: CrearCicloDto)  { return this.svc.create(this.empresaId, body); }
  @Get(':id')   @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR, UserRole.VIEWER)
  findOne(@Param('id', ParseIntPipe) id: number) { return this.svc.findOne(this.empresaId, id); }
  @Patch(':id') @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR)
  update(@Param('id', ParseIntPipe) id: number, @Body() body: ActualizarCicloDto) { return this.svc.update(this.empresaId, id, body); }
  // Acción sensible: cierre de ciclo → solo ADMIN/CONTADOR
  @Post(':id/cerrar') @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  cerrar(@Param('id', ParseIntPipe) id: number, @Body() body: CerrarCicloDto) { return this.svc.cerrar(this.empresaId, id, body); }
  @Get(':id/costos')       @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR, UserRole.VIEWER)
  getCostos(@Param('id', ParseIntPipe) id: number) { return this.svc.getCostos(this.empresaId, id); }
  @Get(':id/rentabilidad') @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR, UserRole.VIEWER)
  getRent(@Param('id', ParseIntPipe) id: number)   { return this.svc.getRentabilidad(this.empresaId, id); }
  @Get(':id/labores')      @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR, UserRole.VIEWER)
  getLabores(@Param('id', ParseIntPipe) id: number) { return this.svc.findLabores(this.empresaId, id); }
  @Get(':id/aplicaciones') @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR, UserRole.VIEWER)
  getApl(@Param('id', ParseIntPipe) id: number)    { return this.svc.findAplicaciones(this.empresaId, id); }
}

// ── Labores independientes ────────────────────────────────────────────────────
import { Controller as Ctrl } from '@nestjs/common';

@Ctrl('agro/labores')
@UseGuards(JwtAuthGuard, RolesGuard, TenantGuard, ModuloAddonGuard('agro'))
export class LaboresController {
  constructor(private readonly svc: CiclosService, private readonly tenantSvc: TenantService) {}
  private get empresaId() { return this.tenantSvc.getEmpresaId(); }

  @Post()       @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR)
  create(@Body() body: CrearLaborDto) { return this.svc.createLabor(this.empresaId, body); }
  @Patch(':id') @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR)
  update(@Param('id', ParseIntPipe) id: number, @Body() body: ActualizarLaborDto) { return this.svc.updateLabor(this.empresaId, id, body); }
}

// ── Aplicaciones de insumos ───────────────────────────────────────────────────
@Ctrl('agro/aplicaciones')
@UseGuards(JwtAuthGuard, RolesGuard, TenantGuard, ModuloAddonGuard('agro'))
export class AplicacionesController {
  constructor(private readonly svc: CiclosService, private readonly tenantSvc: TenantService) {}
  private get empresaId() { return this.tenantSvc.getEmpresaId(); }

  @Post()       @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR)
  create(@Body() body: CrearAplicacionDto) { return this.svc.createAplicacion(this.empresaId, body); }
}
