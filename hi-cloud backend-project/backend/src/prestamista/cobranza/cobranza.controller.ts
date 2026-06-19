import { Controller, Get, Post, Body, Param, Query, ParseIntPipe, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../tenant/tenant.guard';
import { ModuloAddonGuard } from '../../modulos-addon/guards/modulo-addon.guard';
import { TenantService } from '../../tenant/tenant.service';
import { CobranzaService } from './cobranza.service';

@Controller('prestamista/cobranza')
@UseGuards(JwtAuthGuard, TenantGuard, ModuloAddonGuard('prestamista'))
@ApiTags('Prestamista - Cobranza')
@ApiBearerAuth()
export class CobranzaController {
  constructor(private readonly svc: CobranzaService, private readonly tenantSvc: TenantService) {}
  private get empresaId() { return this.tenantSvc.getEmpresaId(); }

  @Get('cartera-vencida') carteraVencida(@Query() q: any) { return this.svc.carteraVencida(this.empresaId, q); }
  @Get('resumen') resumen() { return this.svc.resumenCobranza(this.empresaId); }
  @Get('prestamo/:prestamoId/gestiones') gestiones(@Param('prestamoId', ParseIntPipe) id: number) {
    return this.svc.gestionesByPrestamo(this.empresaId, id);
  }
  @Post('gestiones') registrarGestion(@Body() body: any) { return this.svc.registrarGestion(this.empresaId, body); }
}
