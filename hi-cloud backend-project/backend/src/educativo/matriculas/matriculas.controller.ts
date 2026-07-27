import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards, ParseIntPipe } from '@nestjs/common';
import { MatriculasService } from './matriculas.service';
import { JwtAuthGuard }     from '../../auth/guards/jwt-auth.guard';
import { RolesGuard }       from '../../auth/guards/roles.guard';
import { TenantGuard }      from '../../tenant/tenant.guard';
import { ModuloAddonGuard } from '../../modulos-addon/guards/modulo-addon.guard';
import { TenantService }    from '../../tenant/tenant.service';

@UseGuards(JwtAuthGuard, RolesGuard, TenantGuard, ModuloAddonGuard('educativo'))
@Controller('educativo/matriculas')
export class MatriculasController {
  constructor(
    private readonly svc: MatriculasService,
    private readonly tenantSvc: TenantService,
  ) {}

  @Get()
  list(
    @Query('anioEscolarId') anioEscolarId?: string,
    @Query('gradoId')       gradoId?: string,
    @Query('seccionId')     seccionId?: string,
    @Query('estado')        estado?: string,
    @Query('q')             q?: string,
  ) {
    return this.svc.list(this.tenantSvc.getEmpresaId(), {
      anioEscolarId: anioEscolarId ? Number(anioEscolarId) : undefined,
      gradoId:       gradoId       ? Number(gradoId)       : undefined,
      seccionId:     seccionId     ? Number(seccionId)     : undefined,
      estado,
      q,
    });
  }

  @Get('stats')
  stats(@Query('anioEscolarId') anioEscolarId?: string) {
    return this.svc.stats(
      this.tenantSvc.getEmpresaId(),
      anioEscolarId ? Number(anioEscolarId) : undefined,
    );
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
