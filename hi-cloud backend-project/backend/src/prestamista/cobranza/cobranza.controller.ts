import { Controller, Get, Post, Body, Param, Query, ParseIntPipe, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../tenant/tenant.guard';
import { ModuloAddonGuard } from '../../modulos-addon/guards/modulo-addon.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../users/enums/user-role.enum';
import { TenantService } from '../../tenant/tenant.service';
import { CobranzaService } from './cobranza.service';
import { RegistrarGestionDto } from '../dto/prestamista.dto';

@Controller('prestamista/cobranza')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard, ModuloAddonGuard('prestamista'))
@ApiTags('Prestamista - Cobranza')
@ApiBearerAuth()
export class CobranzaController {
  constructor(private readonly svc: CobranzaService, private readonly tenantSvc: TenantService) {}
  private get empresaId() { return this.tenantSvc.getEmpresaId(); }

  @Get('cartera-vencida')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR, UserRole.VIEWER)
  carteraVencida(@Query() q: any) { return this.svc.carteraVencida(this.empresaId, q); }
  @Get('resumen')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR, UserRole.VIEWER)
  resumen() { return this.svc.resumenCobranza(this.empresaId); }
  @Get('prestamo/:prestamoId/gestiones')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR, UserRole.VIEWER)
  gestiones(@Param('prestamoId', ParseIntPipe) id: number) {
    return this.svc.gestionesByPrestamo(this.empresaId, id);
  }
  // Registrar gestión de cobro: operador básico o superior.
  @Post('gestiones')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR)
  registrarGestion(@Body() body: RegistrarGestionDto) { return this.svc.registrarGestion(this.empresaId, body); }

  @Post('prestamo/:prestamoId/notificar-mora')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  notificarMora(@Param('prestamoId', ParseIntPipe) id: number) {
    return this.svc.notificarMora(this.empresaId, id, this.tenantSvc.getUserId());
  }
}
