import { Controller, Get, Post, Patch, Body, Param, ParseIntPipe, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../tenant/tenant.guard';
import { ModuloAddonGuard } from '../../modulos-addon/guards/modulo-addon.guard';
import { TenantService } from '../../tenant/tenant.service';
import { CiclosService } from './ciclos.service';

@Controller('agro/ciclos')
@UseGuards(JwtAuthGuard, TenantGuard, ModuloAddonGuard('agro'))
export class CiclosController {
  constructor(private readonly svc: CiclosService, private readonly tenantSvc: TenantService) {}
  private get empresaId() { return this.tenantSvc.getEmpresaId(); }

  @Get()        findAll(@Query() q: any)   { return this.svc.findAll(this.empresaId, q); }
  @Post()       create(@Body() body: any)  { return this.svc.create(this.empresaId, body); }
  @Get(':id')   findOne(@Param('id', ParseIntPipe) id: number) { return this.svc.findOne(this.empresaId, id); }
  @Patch(':id') update(@Param('id', ParseIntPipe) id: number, @Body() body: any) { return this.svc.update(this.empresaId, id, body); }
  @Post(':id/cerrar') cerrar(@Param('id', ParseIntPipe) id: number, @Body() body: any) { return this.svc.cerrar(this.empresaId, id, body); }
  @Get(':id/costos')       getCostos(@Param('id', ParseIntPipe) id: number) { return this.svc.getCostos(this.empresaId, id); }
  @Get(':id/rentabilidad') getRent(@Param('id', ParseIntPipe) id: number)   { return this.svc.getRentabilidad(this.empresaId, id); }
  @Get(':id/labores')      getLabores(@Param('id', ParseIntPipe) id: number) { return this.svc.findLabores(this.empresaId, id); }
  @Get(':id/aplicaciones') getApl(@Param('id', ParseIntPipe) id: number)    { return this.svc.findAplicaciones(this.empresaId, id); }
}

// ── Labores independientes ────────────────────────────────────────────────────
import { Controller as Ctrl } from '@nestjs/common';

@Ctrl('agro/labores')
@UseGuards(JwtAuthGuard, TenantGuard, ModuloAddonGuard('agro'))
export class LaboresController {
  constructor(private readonly svc: CiclosService, private readonly tenantSvc: TenantService) {}
  private get empresaId() { return this.tenantSvc.getEmpresaId(); }

  @Post()       create(@Body() body: any) { return this.svc.createLabor(this.empresaId, body); }
  @Patch(':id') update(@Param('id', ParseIntPipe) id: number, @Body() body: any) { return this.svc.updateLabor(this.empresaId, id, body); }
}

// ── Aplicaciones de insumos ───────────────────────────────────────────────────
@Ctrl('agro/aplicaciones')
@UseGuards(JwtAuthGuard, TenantGuard, ModuloAddonGuard('agro'))
export class AplicacionesController {
  constructor(private readonly svc: CiclosService, private readonly tenantSvc: TenantService) {}
  private get empresaId() { return this.tenantSvc.getEmpresaId(); }

  @Post()       create(@Body() body: any) { return this.svc.createAplicacion(this.empresaId, body); }
}
