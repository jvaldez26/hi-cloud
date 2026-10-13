import { Controller, Get, Post, Body, Param, ParseIntPipe, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../tenant/tenant.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../users/enums/user-role.enum';
import { ModuloAddonGuard } from '../../modulos-addon/guards/modulo-addon.guard';
import { RequiereSupervisorSiempre } from '../../supervisor-politicas/guards/requiere-supervisor-siempre.guard';
import { TenantService } from '../../tenant/tenant.service';
import { RefinanciamientoService } from './refinanciamiento.service';
import { RefinanciarDto } from '../dto/prestamista.dto';

/**
 * Etapa 6 — Seguridad: refinanciar() perdona mora/interés exactamente igual
 * que CondonacionService.condonar() cuando el body trae
 * moraCondonada/interesCondonado (ver refinanciamiento.service.ts) — pero
 * sin la autorización dual que /prestamos/:id/condonar SÍ exige siempre
 * (RequiereSupervisorSiempre('condonar_prestamo'), ni el propio ADMIN se
 * autoriza a sí mismo). Cualquier CONTADOR podía condonar deuda arbitraria
 * llamando este endpoint en vez de /condonar. Se le exige la MISMA
 * autorización, pero solo cuando el body efectivamente condona algo — un
 * refinanciamiento normal (sin moraCondonada/interesCondonado) no cambia de
 * comportamiento.
 */
function condonaAlRefinanciar(body: any): boolean {
  return Number(body?.moraCondonada ?? 0) > 0 || Number(body?.interesCondonado ?? 0) > 0;
}

@Controller('prestamista/refinanciamientos')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard, ModuloAddonGuard('prestamista'))
@ApiTags('Prestamista - Refinanciamiento')
@ApiBearerAuth()
export class RefinanciamientoController {
  constructor(private readonly svc: RefinanciamientoService, private readonly tenantSvc: TenantService) {}
  private get empresaId() { return this.tenantSvc.getEmpresaId(); }

  @Get('prestamo/:prestamoId')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR, UserRole.VIEWER)
  findByPrestamo(@Param('prestamoId', ParseIntPipe) id: number) {
    return this.svc.findByPrestamo(this.empresaId, id);
  }
  // Refinanciar/condonar: acción financiera sensible → CONTADOR/ADMIN.
  // Si además condona mora/interés, exige la misma autorización dual que
  // /prestamos/:id/condonar (ver condonaAlRefinanciar arriba).
  @Post()
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @UseGuards(RequiereSupervisorSiempre('condonar_prestamo', { soloSi: condonaAlRefinanciar }))
  refinanciar(@Body() body: RefinanciarDto) { return this.svc.refinanciar(this.empresaId, body); }
}
