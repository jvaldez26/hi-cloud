import { Controller, Get, Post, Patch, Body, Param, ParseIntPipe, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../tenant/tenant.guard';
import { ModuloAddonGuard } from '../../modulos-addon/guards/modulo-addon.guard';
import { TenantService } from '../../tenant/tenant.service';
import { InsumosService } from './insumos.service';

@Controller('agro/insumos')
@UseGuards(JwtAuthGuard, TenantGuard, ModuloAddonGuard('agro'))
export class InsumosController {
  constructor(private readonly svc: InsumosService, private readonly tenantSvc: TenantService) {}
  private get empresaId() { return this.tenantSvc.getEmpresaId(); }

  @Get()        findAll(@Query() q: any)  { return this.svc.findAll(this.empresaId, q); }
  @Post()       create(@Body() body: any) { return this.svc.create(this.empresaId, body); }
  @Patch(':id') update(@Param('id', ParseIntPipe) id: number, @Body() body: any) { return this.svc.update(this.empresaId, id, body); }
}
