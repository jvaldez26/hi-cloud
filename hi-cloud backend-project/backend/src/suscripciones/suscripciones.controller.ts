import {
  Controller, Get, Post, Body,
  HttpCode, HttpStatus, UseGuards, ForbiddenException,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { SuscripcionesService } from './suscripciones.service';
import { LimitesService } from './limites.service';
import { IsEnum, IsOptional, IsString } from 'class-validator';
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

  // ── Endpoints de LECTURA para clientes (read-only) ────────────────────────

  @Get('planes')
  @ApiOperation({ summary: 'Catálogo de planes disponibles (solo lectura)' })
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

  // ── Solicitud de cambio (clientes NO pueden aplicar cambios directamente) ──

  @Post('solicitar-cambio')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Solicitar cambio de plan — requiere aprobación de Super Admin' })
  async solicitarCambio(@Body() dto: SolicitarCambioDto) {
    const empresaId = this.empresaId;

    // Verificar que no haya solicitud pendiente
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

  // ── DEPRECATED: estos endpoints ya no deben usarse desde el cliente ─────────
  // Mantenidos solo para backward compat. Devuelven 403.

  @Post(':empresaId/activar')
  @HttpCode(HttpStatus.FORBIDDEN)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '[DEPRECATED] Usa /solicitar-cambio — el cambio directo fue removido' })
  activar() {
    throw new ForbiddenException(
      'El cambio directo de plan ya no está disponible. ' +
      'Usa POST /suscripciones/solicitar-cambio para solicitar un upgrade. ' +
      'Un asesor lo procesará en menos de 24 horas.',
    );
  }

  // ── Endpoints administrativos (solo ADMIN global — mantenidos para super admin) ──

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
}
