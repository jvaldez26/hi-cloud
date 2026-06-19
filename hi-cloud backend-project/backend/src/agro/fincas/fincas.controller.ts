import { Controller, Get, Post, Patch, Body, Param, ParseIntPipe, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../tenant/tenant.guard';
import { ModuloAddonGuard } from '../../modulos-addon/guards/modulo-addon.guard';
import { TenantService } from '../../tenant/tenant.service';
import { FincasService } from './fincas.service';

@Controller('agro/fincas')
@UseGuards(JwtAuthGuard, TenantGuard, ModuloAddonGuard('agro'))
export class FincasController {
  constructor(private readonly svc: FincasService, private readonly tenantSvc: TenantService) {}
  private get empresaId() { return this.tenantSvc.getEmpresaId(); }

  @Get()       findAll()                                    { return this.svc.findAll(this.empresaId); }
  @Get(':id')  findOne(@Param('id', ParseIntPipe) id: number) { return this.svc.findOne(this.empresaId, id); }
  @Post()      create(@Body() body: any)                    { return this.svc.create(this.empresaId, body); }
  @Patch(':id') update(@Param('id', ParseIntPipe) id: number, @Body() body: any) { return this.svc.update(this.empresaId, id, body); }

  @Get(':id/parcelas') findParcelas(@Param('id', ParseIntPipe) id: number) {
    return this.svc.findParcelas(this.empresaId, id);
  }
}

// ── Parcelas como sub-recurso independiente ──────────────────────────────────
import { Controller as Ctrl } from '@nestjs/common';

@Ctrl('agro/parcelas')
@UseGuards(JwtAuthGuard, TenantGuard, ModuloAddonGuard('agro'))
export class ParcelasController {
  constructor(private readonly svc: FincasService, private readonly tenantSvc: TenantService) {}
  private get empresaId() { return this.tenantSvc.getEmpresaId(); }

  @Get()       findAll(@Query() q: any)   { return this.svc.findParcelas(this.empresaId); }
  @Post()      create(@Body() body: any)  { return this.svc.createParcela(this.empresaId, body); }
  @Patch(':id') update(@Param('id', ParseIntPipe) id: number, @Body() body: any) {
    return this.svc.updateParcela(this.empresaId, id, body);
  }
}
