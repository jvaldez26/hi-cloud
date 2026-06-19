import { Controller, Get, Post, Body, Param, ParseIntPipe, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../tenant/tenant.guard';
import { ModuloAddonGuard } from '../../modulos-addon/guards/modulo-addon.guard';
import { TenantService } from '../../tenant/tenant.service';
import { CosechasService } from './cosechas.service';

@Controller('agro/cosechas')
@UseGuards(JwtAuthGuard, TenantGuard, ModuloAddonGuard('agro'))
export class CosechasController {
  constructor(private readonly svc: CosechasService, private readonly tenantSvc: TenantService) {}
  private get empresaId() { return this.tenantSvc.getEmpresaId(); }

  @Get()       findAll(@Query() q: any)   { return this.svc.findAll(this.empresaId, q); }
  @Post()      create(@Body() body: any)  { return this.svc.create(this.empresaId, body); }
  @Get(':id')  findOne(@Param('id', ParseIntPipe) id: number) { return this.svc.findOne(this.empresaId, id); }
  @Post(':id/ingresar-inventario') ingresarInv(@Param('id', ParseIntPipe) id: number) {
    return this.svc.ingresarInventario(this.empresaId, id);
  }
}
