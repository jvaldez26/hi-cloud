import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../tenant/tenant.guard';
import { ModuloAddonGuard } from '../../modulos-addon/guards/modulo-addon.guard';
import { TenantService } from '../../tenant/tenant.service';
import { AgroDashboardService } from './dashboard.service';

@Controller('agro/dashboard')
@UseGuards(JwtAuthGuard, TenantGuard, ModuloAddonGuard('agro'))
export class AgroDashboardController {
  constructor(private readonly svc: AgroDashboardService, private readonly tenantSvc: TenantService) {}
  private get empresaId() { return this.tenantSvc.getEmpresaId(); }

  @Get() getDashboard() { return this.svc.getDashboard(this.empresaId); }
}
