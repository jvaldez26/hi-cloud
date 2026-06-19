import { Controller, Get, Post, Body, Param, ParseIntPipe, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../tenant/tenant.guard';
import { ModuloAddonGuard } from '../../modulos-addon/guards/modulo-addon.guard';
import { TenantService } from '../../tenant/tenant.service';
import { RefinanciamientoService } from './refinanciamiento.service';

@Controller('prestamista/refinanciamientos')
@UseGuards(JwtAuthGuard, TenantGuard, ModuloAddonGuard('prestamista'))
@ApiTags('Prestamista - Refinanciamiento')
@ApiBearerAuth()
export class RefinanciamientoController {
  constructor(private readonly svc: RefinanciamientoService, private readonly tenantSvc: TenantService) {}
  private get empresaId() { return this.tenantSvc.getEmpresaId(); }

  @Get('prestamo/:prestamoId') findByPrestamo(@Param('prestamoId', ParseIntPipe) id: number) {
    return this.svc.findByPrestamo(this.empresaId, id);
  }
  @Post() refinanciar(@Body() body: any) { return this.svc.refinanciar(this.empresaId, body); }
}
