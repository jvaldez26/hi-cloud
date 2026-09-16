import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { EdReportesService } from './reportes.service';
import { FiltrosReporteDto } from './dto/reportes.dto';
import { JwtAuthGuard }     from '../../auth/guards/jwt-auth.guard';
import { RolesGuard }       from '../../auth/guards/roles.guard';
import { TenantGuard }      from '../../tenant/tenant.guard';
import { ModuloAddonGuard } from '../../modulos-addon/guards/modulo-addon.guard';
import { TenantService }    from '../../tenant/tenant.service';
import { GetUser }          from '../../auth/decorators/get-user.decorator';

/**
 * Los 14 reportes del plan original de educativo. Ninguno reemplaza la
 * pantalla de un submódulo — son vistas agregadas de solo lectura sobre las
 * mismas tablas. Exportación a Excel: 100% frontend (ver
 * utils/exportExcel.ts), estos endpoints solo devuelven JSON.
 */
@UseGuards(JwtAuthGuard, RolesGuard, TenantGuard, ModuloAddonGuard('educativo'))
@Controller('educativo/reportes')
export class EdReportesController {
  constructor(
    private readonly svc: EdReportesService,
    private readonly tenantSvc: TenantService,
  ) {}

  private get empresaId() { return this.tenantSvc.getEmpresaId(); }

  @Get('cartera-colegiatura')
  carteraColegiatura(@Query() f: FiltrosReporteDto) {
    return this.svc.carteraColegiatura(this.empresaId, { anioEscolarId: f.anioEscolarId });
  }

  @Get('morosidad-por-grado')
  morosidadPorGrado(@Query() f: FiltrosReporteDto) {
    return this.svc.morosidadPorGrado(this.empresaId, { anioEscolarId: f.anioEscolarId });
  }

  @Get('cobros-periodo')
  cobrosPeriodo(@Query() f: FiltrosReporteDto) {
    return this.svc.cobrosPeriodo(this.empresaId, { desde: f.desde, hasta: f.hasta });
  }

  @Get('rendimiento-academico')
  rendimientoAcademico(@Query() f: FiltrosReporteDto) {
    return this.svc.rendimientoAcademico(this.empresaId, { periodoId: f.periodoId, gradoId: f.gradoId, seccionId: f.seccionId });
  }

  @Get('estudiantes-riesgo')
  estudiantesRiesgo(@Query() f: FiltrosReporteDto) {
    return this.svc.estudiantesRiesgo(this.empresaId, {
      periodoId: f.periodoId, gradoId: f.gradoId, seccionId: f.seccionId, umbral: f.umbral,
    });
  }

  @Get('cuadro-honor')
  cuadroHonor(@Query() f: FiltrosReporteDto) {
    return this.svc.cuadroHonor(this.empresaId, {
      periodoId: f.periodoId, gradoId: f.gradoId, seccionId: f.seccionId, limite: f.limite,
    });
  }

  @Get('asistencia-grado-periodo')
  asistenciaGradoPeriodo(@Query() f: FiltrosReporteDto) {
    return this.svc.asistenciaGradoPeriodo(this.empresaId, {
      gradoId: f.gradoId, seccionId: f.seccionId, desde: f.desde, hasta: f.hasta,
    });
  }

  @Get('exceso-ausencias')
  excesoAusencias(@Query() f: FiltrosReporteDto) {
    return this.svc.excesoAusencias(this.empresaId, {
      gradoId: f.gradoId, seccionId: f.seccionId, desde: f.desde, hasta: f.hasta, umbral: f.umbral,
    });
  }

  @Get('matricula-crecimiento')
  matriculaCrecimiento(@Query() f: FiltrosReporteDto) {
    return this.svc.matriculaCrecimiento(this.empresaId, { gradoId: f.gradoId });
  }

  @Get('incidentes-disciplinarios')
  incidentesDisciplinarios(@Query() f: FiltrosReporteDto, @GetUser('id') usuarioId: number) {
    return this.svc.incidentesDisciplinariosPorTipo(this.empresaId, usuarioId, { desde: f.desde, hasta: f.hasta });
  }

  @Get('ingresos-por-concepto')
  ingresosPorConcepto(@Query() f: FiltrosReporteDto) {
    return this.svc.ingresosPorConcepto(this.empresaId, { desde: f.desde, hasta: f.hasta });
  }

  @Get('retencion-estudiantes')
  retencionEstudiantes(@Query('anioBaseId') anioBaseId?: string, @Query('anioSiguienteId') anioSiguienteId?: string) {
    return this.svc.retencionEstudiantes(this.empresaId, {
      anioBaseId: anioBaseId ? Number(anioBaseId) : undefined,
      anioSiguienteId: anioSiguienteId ? Number(anioSiguienteId) : undefined,
    });
  }

  @Get('becas-otorgadas')
  becasOtorgadas(@Query() f: FiltrosReporteDto) {
    return this.svc.becasOtorgadas(this.empresaId, { anioEscolarId: f.anioEscolarId });
  }

  @Get('productividad-docente')
  productividadDocente(@Query() f: FiltrosReporteDto) {
    return this.svc.productividadDocente(this.empresaId, { anioEscolarId: f.anioEscolarId });
  }
}
