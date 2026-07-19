import { Controller, Get, Post, Patch, Body, Param, ParseIntPipe, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../tenant/tenant.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../users/enums/user-role.enum';
import { ModuloAddonGuard } from '../../modulos-addon/guards/modulo-addon.guard';
import { TenantService } from '../../tenant/tenant.service';
import { GanaderiaService } from './ganaderia.service';

@Controller('agro/animales')
@UseGuards(JwtAuthGuard, RolesGuard, TenantGuard, ModuloAddonGuard('agro'))
export class GanaderiaController {
  constructor(private readonly svc: GanaderiaService, private readonly tenantSvc: TenantService) {}
  private get empresaId() { return this.tenantSvc.getEmpresaId(); }

  @Get()        @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR, UserRole.VIEWER)
  findAll(@Query() q: any)   { return this.svc.findAll(this.empresaId, q); }
  @Post()       @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR)
  create(@Body() body: any)  { return this.svc.create(this.empresaId, body); }
  @Get(':id')   @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR, UserRole.VIEWER)
  findOne(@Param('id', ParseIntPipe) id: number) { return this.svc.findOne(this.empresaId, id); }
  // PATCH es el vehículo de la BAJA de ganado (estado/isActive) → acción sensible: ADMIN/CONTADOR
  @Patch(':id') @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  update(@Param('id', ParseIntPipe) id: number, @Body() body: any) { return this.svc.update(this.empresaId, id, body); }
  @Get(':id/eventos')    @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR, UserRole.VIEWER)
  getEventos(@Param('id', ParseIntPipe) id: number) { return this.svc.getEventos(this.empresaId, id); }
  @Post(':id/eventos')   @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR)
  crearEvento(@Param('id', ParseIntPipe) id: number, @Body() body: any) { return this.svc.createEvento(this.empresaId, id, body); }
  @Get(':id/genealogia') @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR, UserRole.VIEWER)
  getGeneal(@Param('id', ParseIntPipe) id: number) { return this.svc.getGenealogía(this.empresaId, id); }
}

// ── Endpoints ganadería general ──────────────────────────────────────────────
import { Controller as Ctrl } from '@nestjs/common';

@Ctrl('agro/ganaderia')
@UseGuards(JwtAuthGuard, RolesGuard, TenantGuard, ModuloAddonGuard('agro'))
export class GanaderiaResumenController {
  constructor(private readonly svc: GanaderiaService, private readonly tenantSvc: TenantService) {}
  private get empresaId() { return this.tenantSvc.getEmpresaId(); }

  @Get('produccion-leche')    @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR, UserRole.VIEWER)
  getLec(@Query() q: any)  { return this.svc.getProduccionLeche(this.empresaId, q); }
  @Get('calendario-sanitario') @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR, UserRole.VIEWER)
  getCal()                { return this.svc.getCalendarioSanitario(this.empresaId); }
}
