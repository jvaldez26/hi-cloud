import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard }       from '../../auth/guards/jwt-auth.guard';
import { RolesGuard }         from '../../auth/guards/roles.guard';
import { TenantGuard }        from '../../tenant/tenant.guard';
import { Roles }              from '../../auth/decorators/roles.decorator';
import { UserRole }           from '../../users/enums/user-role.enum';
import { ModuloAddonGuard }   from '../../modulos-addon/guards/modulo-addon.guard';
import { TenantService }      from '../../tenant/tenant.service';
import { EdDashboardService } from './dashboard.service';

@UseGuards(JwtAuthGuard, RolesGuard, TenantGuard, ModuloAddonGuard('educativo'))
@Controller('educativo/dashboard')
export class EdDashboardController {
  constructor(
    private readonly svc: EdDashboardService,
    private readonly tenantSvc: TenantService,
  ) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VIEWER)
  getDashboard() { return this.svc.getDashboard(this.tenantSvc.getEmpresaId()); }
}
