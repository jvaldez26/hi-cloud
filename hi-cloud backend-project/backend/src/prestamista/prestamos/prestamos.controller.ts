import { Controller, Get, Post, Patch, Body, Param, Query, ParseIntPipe, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../tenant/tenant.guard';
import { ModuloAddonGuard } from '../../modulos-addon/guards/modulo-addon.guard';
import { TenantService } from '../../tenant/tenant.service';
import { PrestamosService } from './prestamos.service';

@Controller('prestamista/prestamos')
@UseGuards(JwtAuthGuard, TenantGuard, ModuloAddonGuard('prestamista'))
@ApiTags('Prestamista - Préstamos')
@ApiBearerAuth()
export class PrestamosController {
  constructor(private readonly svc: PrestamosService, private readonly tenantSvc: TenantService) {}
  private get empresaId() { return this.tenantSvc.getEmpresaId(); }

  @Get() findAll(@Query() q: any) { return this.svc.findAll(this.empresaId, q); }
  @Get(':id') findOne(@Param('id', ParseIntPipe) id: number) { return this.svc.findOne(this.empresaId, id); }
  @Post() create(@Body() body: any) { return this.svc.create(this.empresaId, body); }
  @Post('simular') simular(@Body() body: any) { return this.svc.simular(body); }
  @Patch(':id/cancelar') cancelar(@Param('id', ParseIntPipe) id: number, @Body() body: any) {
    return this.svc.cancelar(this.empresaId, id, body?.motivo);
  }
}
