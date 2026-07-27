import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards, ParseIntPipe } from '@nestjs/common';
import { DocentesService } from './docentes.service';
import { JwtAuthGuard }     from '../../auth/guards/jwt-auth.guard';
import { RolesGuard }       from '../../auth/guards/roles.guard';
import { TenantGuard }      from '../../tenant/tenant.guard';
import { ModuloAddonGuard } from '../../modulos-addon/guards/modulo-addon.guard';
import { TenantService }    from '../../tenant/tenant.service';

@UseGuards(JwtAuthGuard, RolesGuard, TenantGuard, ModuloAddonGuard('educativo'))
@Controller('educativo/docentes')
export class DocentesController {
  constructor(
    private readonly svc: DocentesService,
    private readonly tenantSvc: TenantService,
  ) {}

  @Get()
  list(@Query('q') q?: string) {
    return this.svc.list(this.tenantSvc.getEmpresaId(), q);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.svc.findOne(this.tenantSvc.getEmpresaId(), id);
  }

  @Post()
  create(@Body() dto: any) {
    return this.svc.create(this.tenantSvc.getEmpresaId(), dto);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: any) {
    return this.svc.update(this.tenantSvc.getEmpresaId(), id, dto);
  }
}
