import {
  Controller, Get, Post, Patch, Body, Param, ParseIntPipe,
  HttpCode, HttpStatus, UseGuards, ForbiddenException, Query,
} from '@nestjs/common';
import { PlanTipo, ModalidadPago } from './entities/suscripcion.entity';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { SuscripcionesService } from './suscripciones.service';
import { LimitesService } from './limites.service';
import { IsEnum, IsOptional, IsString, IsInt, Min, Max } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { TenantService } from '../tenant/tenant.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SolicitudCambioPlan, EstadoSolicitud } from './entities/solicitud-cambio-plan.entity';

class SolicitarCambioDto {
  @IsString() planSolicitado: string;
  @IsOptional() @IsEnum(['mensual', 'anual']) modalidad?: string;
  @IsOptional() @IsString() comentario?: string;
}

class AprobarSolicitudDto {
  @IsOptional() @IsString() notaInterna?: string;
}

class RechazarSolicitudDto {
  @IsString() motivoRechazo: string;
}

class ExtenderPruebaDto {
  @IsInt() @Min(1) @Max(90) dias: number;
}

@ApiTags('Suscripciones')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('suscripciones')
export class SuscripcionesController {
  constructor(
    private svc:        SuscripcionesService,
    private limitesSvc: LimitesService,
    private tenantSvc:  TenantService,
    @InjectRepository(SolicitudCambioPlan)
    private solicitudRepo: Repository<SolicitudCambioPlan>,
  ) {}

  private get empresaId() {
    try { return this.tenantSvc.getEmpresaId(); } catch { return 1; }
  }

  // ── Endpoints de LECTURA para clientes ────────────────────────────────────

  @Get('planes')
  @ApiOperation({ summary: 'Catálogo de planes disponibles' })
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

  @Get('mi-solicitud')
  @ApiOperation({ summary: 'Estado de la última solicitud de cambio de plan' })
  getMiSolicitud() {
    return this.solicitudRepo.findOne({
      where: { empresaId: this.empresaId },
      order: { createdAt: 'DESC' },
    });
  }

  // ── Solicitud de cambio (cliente) ─────────────────────────────────────────

  @Post('solicitar-cambio')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Solicitar cambio de plan — requiere aprobación de Super Admin' })
  async solicitarCambio(@Body() dto: SolicitarCambioDto) {
    const empresaId = this.empresaId;

    const pendiente = await this.solicitudRepo.findOne({
      where: { empresaId, estado: EstadoSolicitud.PENDIENTE },
    });
    if (pendiente) {
      throw new ForbiddenException(
        'Ya tienes una solicitud de cambio de plan pendiente. ' +
        'Un asesor te contactará para coordinar el pago y activación.',
      );
    }

    const solicitud = await this.solicitudRepo.save(
      this.solicitudRepo.create({
        empresaId,
        planSolicitado: dto.planSolicitado,
        modalidad:      dto.modalidad ?? 'mensual',
        comentario:     dto.comentario,
        estado:         EstadoSolicitud.PENDIENTE,
      }),
    );

    return {
      message: 'Tu solicitud fue recibida. Un asesor te contactará en menos de 24 horas para coordinar el pago y activación.',
      solicitudId: solicitud.id,
    };
  }

  // ── Endpoints administrativos — Solo Super Admin ──────────────────────────

  @Get('admin/solicitudes')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: '[Admin] Listar todas las solicitudes de cambio de plan' })
  listarSolicitudes(@Query('estado') estado?: EstadoSolicitud) {
    return this.svc.listarSolicitudes(estado);
  }

  @Get('admin/solicitudes/pendientes/count')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: '[Admin] Contar solicitudes pendientes (para badge)' })
  contarSolicitudesPendientes() {
    return this.svc.contarSolicitudesPendientes();
  }

  @Post('admin/solicitudes/:id/aprobar')
  @Roles(UserRole.SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '[Admin] Aprobar solicitud y activar plan' })
  aprobarSolicitud(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AprobarSolicitudDto,
  ) {
    // Extraer superAdminId del JWT (el guard lo pone en req.user)
    return this.svc.aprobarSolicitud(id, 0, dto.notaInterna);
  }

  @Post('admin/solicitudes/:id/rechazar')
  @Roles(UserRole.SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '[Admin] Rechazar solicitud' })
  rechazarSolicitud(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RechazarSolicitudDto,
  ) {
    return this.svc.rechazarSolicitud(id, 0, dto.motivoRechazo);
  }

  @Get('admin/pruebas')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: '[Admin] Empresas en período de prueba' })
  listarEmpresasEnPrueba() {
    return this.svc.listarEmpresasEnPrueba();
  }

  @Patch('admin/:empresaId/extender-prueba')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: '[Admin] Extender período de prueba' })
  extenderPrueba(
    @Param('empresaId', ParseIntPipe) empresaId: number,
    @Body() dto: ExtenderPruebaDto,
  ) {
    return this.svc.extenderPrueba(empresaId, dto.dias, 0);
  }

  @Patch('admin/:empresaId/activar')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: '[Admin] Activar plan directamente' })
  activarDirecto(
    @Param('empresaId', ParseIntPipe) empresaId: number,
    @Body() body: { plan: string; meses?: number; notas?: string; modalidad?: string },
  ) {
    return this.svc.activarPlan(
      empresaId,
      body.plan as any,
      body.meses ?? 1,
      body.notas,
      body.modalidad === 'anual' ? ModalidadPago.ANUAL : ModalidadPago.MENSUAL,
    );
  }

  @Patch('admin/:empresaId/suspender')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: '[Admin] Suspender empresa manualmente' })
  suspenderAdmin(
    @Param('empresaId', ParseIntPipe) empresaId: number,
    @Body() body: { motivo?: string },
  ) {
    return this.svc.suspender(empresaId, body.motivo);
  }

  // ── Listados (admin legacy) ───────────────────────────────────────────────

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

  // ── DEPRECATED ────────────────────────────────────────────────────────────

  @Post(':empresaId/activar')
  @HttpCode(HttpStatus.FORBIDDEN)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '[DEPRECATED] Usa /admin/:empresaId/activar' })
  activar() {
    throw new ForbiddenException('Usa POST /suscripciones/admin/:empresaId/activar');
  }
}
