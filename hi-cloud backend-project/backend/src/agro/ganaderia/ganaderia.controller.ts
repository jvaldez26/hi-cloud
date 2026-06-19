import { Controller, Get, Post, Patch, Body, Param, ParseIntPipe, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../tenant/tenant.guard';
import { ModuloAddonGuard } from '../../modulos-addon/guards/modulo-addon.guard';
import { TenantService } from '../../tenant/tenant.service';
import { GanaderiaService } from './ganaderia.service';

@Controller('agro/animales')
@UseGuards(JwtAuthGuard, TenantGuard, ModuloAddonGuard('agro'))
export class GanaderiaController {
  constructor(private readonly svc: GanaderiaService, private readonly tenantSvc: TenantService) {}
  private get empresaId() { return this.tenantSvc.getEmpresaId(); }

  @Get()        findAll(@Query() q: any)   { return this.svc.findAll(this.empresaId, q); }
  @Post()       create(@Body() body: any)  { return this.svc.create(this.empresaId, body); }
  @Get(':id')   findOne(@Param('id', ParseIntPipe) id: number) { return this.svc.findOne(this.empresaId, id); }
  @Patch(':id') update(@Param('id', ParseIntPipe) id: number, @Body() body: any) { return this.svc.update(this.empresaId, id, body); }
  @Get(':id/eventos')    getEventos(@Param('id', ParseIntPipe) id: number) { return this.svc.getEventos(this.empresaId, id); }
  @Post(':id/eventos')   crearEvento(@Param('id', ParseIntPipe) id: number, @Body() body: any) { return this.svc.createEvento(this.empresaId, id, body); }
  @Get(':id/genealogia') getGeneal(@Param('id', ParseIntPipe) id: number) { return this.svc.getGenealogía(this.empresaId, id); }
}

// ── Endpoints ganadería general ──────────────────────────────────────────────
import { Controller as Ctrl } from '@nestjs/common';

@Ctrl('agro/ganaderia')
@UseGuards(JwtAuthGuard, TenantGuard, ModuloAddonGuard('agro'))
export class GanaderiaResumenController {
  constructor(private readonly svc: GanaderiaService, private readonly tenantSvc: TenantService) {}
  private get empresaId() { return this.tenantSvc.getEmpresaId(); }

  @Get('produccion-leche')    getLec(@Query() q: any)  { return this.svc.getProduccionLeche(this.empresaId, q); }
  @Get('calendario-sanitario') getCal()                { return this.svc.getCalendarioSanitario(this.empresaId); }
}
