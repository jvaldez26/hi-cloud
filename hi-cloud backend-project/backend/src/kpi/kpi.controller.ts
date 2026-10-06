import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { KpiService } from './kpi.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { RequiereSupervisor } from '../supervisor-politicas/guards/requiere-supervisor.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/enums/user-role.enum';

// Mismo criterio que "Ver Ganancias" en el POS (Forced) — ver analytics.controller.ts.
@ApiTags('KPI Dashboard Ejecutivo')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard, RequiereSupervisor('ver_reportes'))
@Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR)
@Controller('kpi')
export class KpiController {
  constructor(private svc: KpiService) {}

  @Get()
  @ApiOperation({ summary: 'Dashboard ejecutivo — KPIs en tiempo real de todos los módulos' })
  getKpis() { return this.svc.getKpis(); }
}
