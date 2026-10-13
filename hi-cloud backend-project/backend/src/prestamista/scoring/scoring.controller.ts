import { Controller, Get, Param, ParseIntPipe, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../tenant/tenant.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../users/enums/user-role.enum';
import { ModuloAddonGuard } from '../../modulos-addon/guards/modulo-addon.guard';
import { TenantService } from '../../tenant/tenant.service';
import { DeudorScoringService } from './scoring.service';

/**
 * Score crediticio del deudor — Etapa 7. Solo informativo (nunca
 * aprueba/rechaza/bloquea nada), mismos roles de lectura que
 * DeudoresController/DashboardPrestamistaController.
 */
@Controller('prestamista/deudores')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard, ModuloAddonGuard('prestamista'))
@ApiTags('Prestamista - Scoring')
@ApiBearerAuth()
export class ScoringController {
  constructor(private readonly svc: DeudorScoringService, private readonly tenantSvc: TenantService) {}
  private get empresaId() { return this.tenantSvc.getEmpresaId(); }

  @Get(':id/score')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR, UserRole.VIEWER)
  calcular(@Param('id', ParseIntPipe) id: number) {
    return this.svc.calcular(this.empresaId, id);
  }
}
