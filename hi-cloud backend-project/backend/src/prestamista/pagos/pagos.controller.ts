import { Controller, Get, Post, Body, Param, ParseIntPipe, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../tenant/tenant.guard';
import { ModuloAddonGuard } from '../../modulos-addon/guards/modulo-addon.guard';
import { TenantService } from '../../tenant/tenant.service';
import { PagosService } from './pagos.service';

@Controller('prestamista/pagos')
@UseGuards(JwtAuthGuard, TenantGuard, ModuloAddonGuard('prestamista'))
@ApiTags('Prestamista - Pagos')
@ApiBearerAuth()
export class PagosController {
  constructor(private readonly svc: PagosService, private readonly tenantSvc: TenantService) {}
  private get empresaId() { return this.tenantSvc.getEmpresaId(); }

  @Get('prestamo/:prestamoId') findByPrestamo(@Param('prestamoId', ParseIntPipe) id: number) {
    return this.svc.findByPrestamo(this.empresaId, id);
  }
  @Get(':id') findOne(@Param('id', ParseIntPipe) id: number) {
    return this.svc.findOne(this.empresaId, id);
  }
  @Post() registrar(@Body() body: any) { return this.svc.registrar(this.empresaId, body); }
}
