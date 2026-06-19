import { Controller, Get, Post, Patch, Body, Param, Query, ParseIntPipe, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../tenant/tenant.guard';
import { ModuloAddonGuard } from '../../modulos-addon/guards/modulo-addon.guard';
import { TenantService } from '../../tenant/tenant.service';
import { SolicitudesService } from './solicitudes.service';

@Controller('prestamista/solicitudes')
@UseGuards(JwtAuthGuard, TenantGuard, ModuloAddonGuard('prestamista'))
@ApiTags('Prestamista - Solicitudes')
@ApiBearerAuth()
export class SolicitudesController {
  constructor(private readonly svc: SolicitudesService, private readonly tenantSvc: TenantService) {}
  private get empresaId() { return this.tenantSvc.getEmpresaId(); }

  @Get() findAll(@Query() q: any) { return this.svc.findAll(this.empresaId, q); }
  @Get(':id') findOne(@Param('id', ParseIntPipe) id: number) { return this.svc.findOne(this.empresaId, id); }
  @Post() create(@Body() body: any) { return this.svc.create(this.empresaId, body); }
  @Patch(':id') update(@Param('id', ParseIntPipe) id: number, @Body() body: any) { return this.svc.update(this.empresaId, id, body); }
  @Post(':id/decidir') decidir(@Param('id', ParseIntPipe) id: number, @Body() body: any) { return this.svc.decidir(this.empresaId, id, body); }
}
