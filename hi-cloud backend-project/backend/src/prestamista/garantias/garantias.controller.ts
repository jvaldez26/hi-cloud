import { Controller, Get, Post, Patch, Body, Param, ParseIntPipe, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../tenant/tenant.guard';
import { ModuloAddonGuard } from '../../modulos-addon/guards/modulo-addon.guard';
import { TenantService } from '../../tenant/tenant.service';
import { GarantiasService } from './garantias.service';

@Controller('prestamista/garantias')
@UseGuards(JwtAuthGuard, TenantGuard, ModuloAddonGuard('prestamista'))
@ApiTags('Prestamista - Garantías')
@ApiBearerAuth()
export class GarantiasController {
  constructor(private readonly svc: GarantiasService, private readonly tenantSvc: TenantService) {}
  private get empresaId() { return this.tenantSvc.getEmpresaId(); }

  @Get('prestamo/:prestamoId') findByPrestamo(@Param('prestamoId', ParseIntPipe) id: number) {
    return this.svc.findByPrestamo(this.empresaId, id);
  }
  @Get('deudor/:deudorId') findByDeudor(@Param('deudorId', ParseIntPipe) id: number) {
    return this.svc.findByDeudor(this.empresaId, id);
  }
  @Get(':id') findOne(@Param('id', ParseIntPipe) id: number) { return this.svc.findOne(this.empresaId, id); }
  @Post() create(@Body() body: any) { return this.svc.create(this.empresaId, body); }
  @Patch(':id') update(@Param('id', ParseIntPipe) id: number, @Body() body: any) { return this.svc.update(this.empresaId, id, body); }
}
