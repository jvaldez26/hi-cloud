import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards, ParseIntPipe } from '@nestjs/common';
import { TransporteService } from './transporte.service';
import { CreateRutaDto, UpdateRutaDto, AsignarEstudianteRutaDto, FiltrosAsignacionDto } from './dto/transporte.dto';
import { JwtAuthGuard }     from '../../auth/guards/jwt-auth.guard';
import { RolesGuard }       from '../../auth/guards/roles.guard';
import { TenantGuard }      from '../../tenant/tenant.guard';
import { ModuloAddonGuard } from '../../modulos-addon/guards/modulo-addon.guard';
import { TenantService }    from '../../tenant/tenant.service';

@UseGuards(JwtAuthGuard, RolesGuard, TenantGuard, ModuloAddonGuard('educativo'))
@Controller('educativo/transporte')
export class TransporteController {
  constructor(
    private readonly svc: TransporteService,
    private readonly tenantSvc: TenantService,
  ) {}

  private get empresaId() { return this.tenantSvc.getEmpresaId(); }

  // ── Rutas ──────────────────────────────────────────────────────────────

  @Get('rutas')
  listRutas(@Query('isActive') isActive?: string) {
    return this.svc.listRutas(this.empresaId, {
      isActive: isActive !== undefined ? isActive === 'true' : undefined,
    });
  }

  @Post('rutas')
  createRuta(@Body() dto: CreateRutaDto) {
    return this.svc.createRuta(this.empresaId, dto);
  }

  @Patch('rutas/:id')
  updateRuta(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateRutaDto) {
    return this.svc.updateRuta(this.empresaId, id, dto);
  }

  // ── Asignaciones ──────────────────────────────────────────────────────

  @Get('estudiantes')
  listAsignaciones(@Query() filtros: FiltrosAsignacionDto) {
    return this.svc.listAsignaciones(this.empresaId, filtros);
  }

  @Post('estudiantes')
  asignarEstudiante(@Body() dto: AsignarEstudianteRutaDto) {
    return this.svc.asignarEstudiante(this.empresaId, dto);
  }

  @Post('estudiantes/:id/desasignar')
  desasignarEstudiante(@Param('id', ParseIntPipe) id: number) {
    return this.svc.desasignarEstudiante(this.empresaId, id);
  }
}
