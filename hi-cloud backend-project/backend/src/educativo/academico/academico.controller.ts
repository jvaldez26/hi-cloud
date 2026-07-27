import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards, ParseIntPipe } from '@nestjs/common';
import { AcademicoService } from './academico.service';
import { JwtAuthGuard }     from '../../auth/guards/jwt-auth.guard';
import { RolesGuard }       from '../../auth/guards/roles.guard';
import { TenantGuard }      from '../../tenant/tenant.guard';
import { ModuloAddonGuard } from '../../modulos-addon/guards/modulo-addon.guard';
import { TenantService }    from '../../tenant/tenant.service';

@UseGuards(JwtAuthGuard, RolesGuard, TenantGuard, ModuloAddonGuard('educativo'))
@Controller('educativo/academico')
export class AcademicoController {
  constructor(
    private readonly svc: AcademicoService,
    private readonly tenantSvc: TenantService,
  ) {}

  // ── Evaluaciones ────────────────────────────────────────────────────────────

  @Get('evaluaciones')
  listEvaluaciones(
    @Query('seccionId')    seccionId?: string,
    @Query('asignaturaId') asignaturaId?: string,
    @Query('periodoId')    periodoId?: string,
  ) {
    return this.svc.listEvaluaciones(this.tenantSvc.getEmpresaId(), {
      seccionId:    seccionId    ? Number(seccionId)    : undefined,
      asignaturaId: asignaturaId ? Number(asignaturaId) : undefined,
      periodoId:    periodoId    ? Number(periodoId)    : undefined,
    });
  }

  @Post('evaluaciones')
  createEvaluacion(@Body() dto: any) {
    return this.svc.createEvaluacion(this.tenantSvc.getEmpresaId(), dto);
  }

  @Patch('evaluaciones/:id')
  updateEvaluacion(@Param('id', ParseIntPipe) id: number, @Body() dto: any) {
    return this.svc.updateEvaluacion(this.tenantSvc.getEmpresaId(), id, dto);
  }

  // ── Planilla / calificaciones ────────────────────────────────────────────────

  @Get('planilla')
  getPlanilla(
    @Query('seccionId', ParseIntPipe)    seccionId: number,
    @Query('asignaturaId', ParseIntPipe) asignaturaId: number,
    @Query('periodoId')                  periodoId?: string,
  ) {
    return this.svc.getPlanilla(
      this.tenantSvc.getEmpresaId(), seccionId, asignaturaId,
      periodoId ? Number(periodoId) : undefined,
    );
  }

  @Post('calificaciones/bulk')
  bulkCalificaciones(@Body() body: { items: Array<{ evaluacionId: number; estudianteId: number; nota: number }> }) {
    return this.svc.bulkCalificaciones(this.tenantSvc.getEmpresaId(), body.items ?? []);
  }

  // ── Asistencia ──────────────────────────────────────────────────────────────

  @Get('asistencia')
  getAsistencia(
    @Query('seccionId', ParseIntPipe) seccionId: number,
    @Query('fecha') fecha: string,
  ) {
    return this.svc.getAsistencia(this.tenantSvc.getEmpresaId(), seccionId, fecha);
  }

  @Post('asistencia/bulk')
  bulkAsistencia(@Body() body: {
    seccionId: number; fecha: string;
    items: Array<{ estudianteId: number; estado: string; observaciones?: string }>;
  }) {
    return this.svc.bulkAsistencia(
      this.tenantSvc.getEmpresaId(), body.seccionId, body.fecha, body.items ?? [],
    );
  }

  @Get('asistencia/stats')
  statsAsistencia(
    @Query('seccionId', ParseIntPipe) seccionId: number,
    @Query('fechaInicio') fechaInicio?: string,
    @Query('fechaFin')    fechaFin?: string,
  ) {
    return this.svc.statsAsistencia(this.tenantSvc.getEmpresaId(), seccionId, { fechaInicio, fechaFin });
  }
}
