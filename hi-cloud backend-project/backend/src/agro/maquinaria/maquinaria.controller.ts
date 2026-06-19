import { Controller, Get, Post, Patch, Body, Param, ParseIntPipe, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../tenant/tenant.guard';
import { ModuloAddonGuard } from '../../modulos-addon/guards/modulo-addon.guard';
import { TenantService } from '../../tenant/tenant.service';
import { MaquinariaService } from './maquinaria.service';

@Controller('agro/maquinaria')
@UseGuards(JwtAuthGuard, TenantGuard, ModuloAddonGuard('agro'))
export class MaquinariaController {
  constructor(private readonly svc: MaquinariaService, private readonly tenantSvc: TenantService) {}
  private get empresaId() { return this.tenantSvc.getEmpresaId(); }

  @Get()        findAll()                                       { return this.svc.findAll(this.empresaId); }
  @Post()       create(@Body() body: any)                       { return this.svc.create(this.empresaId, body); }
  @Patch(':id') update(@Param('id', ParseIntPipe) id: number, @Body() body: any) { return this.svc.update(this.empresaId, id, body); }
}
