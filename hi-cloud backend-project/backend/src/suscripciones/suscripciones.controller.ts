import {
  Controller, Get, Post, Patch, Body, Param,
  ParseIntPipe, HttpCode, HttpStatus, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { SuscripcionesService } from './suscripciones.service';
import { LimitesService } from './limites.service';
import { PlanTipo, PLANES } from './entities/suscripcion.entity';
import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { TenantService } from '../tenant/tenant.service';

class ActivarPlanDto {
  @IsEnum(PlanTipo)  plan: PlanTipo;
  @IsInt() @Min(1)   meses: number;
  @IsOptional() @IsString() notas?: string;
}

@ApiTags('Suscripciones')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('suscripciones')
export class SuscripcionesController {
  constructor(
    private svc:       SuscripcionesService,
    private limitesSvc: LimitesService,
    private tenantSvc: TenantService,
  ) {}

  private get empresaId() {
    try { return this.tenantSvc.getEmpresaId(); } catch { return 1; }
  }

  // ── Endpoints de usuario ──────────────────────────────────────────────────

  @Get('planes')
  @ApiOperation({ summary: 'Catálogo de todos los planes (con precios desde la BD)' })
  getPlanes() {
    return this.svc.getPlanesCatalogo();
  }

  @Get('mi-plan')
  @ApiOperation({ summary: 'Plan y estado de la suscripción actual' })
  getMiPlan() {
    return this.svc.getSuscripcion(this.empresaId);
  }

  @Get('mis-limites')
  @ApiOperation({ summary: 'Uso actual vs límites del plan' })
  getMisLimites() {
    return this.limitesSvc.getLimitesActuales(this.empresaId);
  }

  // ── Endpoints administrativos ─────────────────────────────────────────────

  @Get()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Listar todas las suscripciones' })
  listarTodas() {
    return this.svc.listarTodasLasSuscripciones();
  }

  @Get('estadisticas')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Estadísticas de planes activos' })
  estadisticas() {
    return this.svc.getEstadisticasPlanes();
  }

  @Post(':empresaId/activar')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Activar o cambiar plan de una empresa' })
  activar(
    @Param('empresaId', ParseIntPipe) empresaId: number,
    @Body() dto: ActivarPlanDto,
  ) {
    return this.svc.activarPlan(empresaId, dto.plan, dto.meses, dto.notas);
  }

  @Patch(':empresaId/suspender')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Suspender suscripción de una empresa' })
  suspender(@Param('empresaId', ParseIntPipe) empresaId: number) {
    return this.svc.suspender(empresaId);
  }
}
