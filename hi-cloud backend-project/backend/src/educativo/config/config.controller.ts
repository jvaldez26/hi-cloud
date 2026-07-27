import { Controller, Get, Post, Patch, Body, Param, ParseIntPipe, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard }      from '../../auth/guards/jwt-auth.guard';
import { RolesGuard }        from '../../auth/guards/roles.guard';
import { TenantGuard }       from '../../tenant/tenant.guard';
import { Roles }             from '../../auth/decorators/roles.decorator';
import { UserRole }          from '../../users/enums/user-role.enum';
import { ModuloAddonGuard }  from '../../modulos-addon/guards/modulo-addon.guard';
import { TenantService }     from '../../tenant/tenant.service';
import { EdConfigService }   from './config.service';

@UseGuards(JwtAuthGuard, RolesGuard, TenantGuard, ModuloAddonGuard('educativo'))
@Controller('educativo')
export class EdConfigController {
  constructor(
    private readonly svc: EdConfigService,
    private readonly tenantSvc: TenantService,
  ) {}

  private get empresaId() { return this.tenantSvc.getEmpresaId(); }

  // ── Config ──────────────────────────────────────────────────────────────

  @Get('config')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VIEWER)
  getConfig() { return this.svc.getConfig(this.empresaId); }

  @Post('config')
  @Roles(UserRole.ADMIN)
  upsertConfig(@Body() body: any) { return this.svc.upsertConfig(this.empresaId, body); }

  // ── Años escolares ──────────────────────────────────────────────────────

  @Get('anios-escolares')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR, UserRole.VIEWER)
  listAnios() { return this.svc.listAnios(this.empresaId); }

  @Get('anios-escolares/actual')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR, UserRole.VIEWER)
  getAnioActual() { return this.svc.getAnioActual(this.empresaId); }

  @Post('anios-escolares')
  @Roles(UserRole.ADMIN)
  createAnio(@Body() body: any) { return this.svc.createAnio(this.empresaId, body); }

  @Patch('anios-escolares/:id')
  @Roles(UserRole.ADMIN)
  updateAnio(@Param('id', ParseIntPipe) id: number, @Body() body: any) {
    return this.svc.updateAnio(this.empresaId, id, body);
  }

  // ── Periodos ────────────────────────────────────────────────────────────

  @Get('periodos')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR, UserRole.VIEWER)
  listPeriodos(@Query('anioEscolarId') anioId?: string) {
    return this.svc.listPeriodos(this.empresaId, anioId ? +anioId : undefined);
  }

  @Post('periodos')
  @Roles(UserRole.ADMIN)
  createPeriodo(@Body() body: any) { return this.svc.createPeriodo(this.empresaId, body); }

  @Patch('periodos/:id')
  @Roles(UserRole.ADMIN)
  updatePeriodo(@Param('id', ParseIntPipe) id: number, @Body() body: any) {
    return this.svc.updatePeriodo(this.empresaId, id, body);
  }
}
