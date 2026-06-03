import {
  Controller,
  Get,
  Param,
  Query,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { AuditoriaService } from './auditoria.service';
import { FiltroAuditoriaDto } from './dto/filtro-auditoria.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { TenantService } from '../tenant/tenant.service';

@ApiTags('Auditoría y Logs')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.CONTADOR)
@Controller('auditoria')
export class AuditoriaController {
  constructor(
    private auditoriaService: AuditoriaService,
    private tenantService:    TenantService,
  ) {}

  /**
   * Usa getEmpresaIdOrNull() — no lanza excepción si el super_admin no tiene
   * tenant context. En ese caso, empresaId = null → devuelve TODOS los logs.
   */
  private get empresaId(): number | null {
    return this.tenantService.getEmpresaIdOrNull();
  }

  @Get('resumen')
  @ApiOperation({ summary: 'Resumen: eventos por período, módulo, usuario y errores' })
  getResumen() {
    return this.auditoriaService.getResumen(this.empresaId ?? undefined);
  }

  @Get('modulos')
  @ApiOperation({ summary: 'Lista de módulos distintos con logs registrados' })
  getModulos() {
    return this.auditoriaService.getModulosDistintos(this.empresaId ?? undefined);
  }

  @Get('errores')
  @ApiOperation({ summary: 'Últimos errores del sistema (operaciones fallidas)' })
  @ApiQuery({ name: 'limite', required: false, example: 10 })
  getUltimosErrores(@Query('limite') limite?: number) {
    return this.auditoriaService.getUltimosErrores(Number(limite ?? 10), this.empresaId ?? undefined);
  }

  @Get()
  @ApiOperation({ summary: 'Historial completo de auditoría con filtros' })
  getLogs(@Query() filtro: FiltroAuditoriaDto) {
    return this.auditoriaService.getLogs(filtro, this.empresaId ?? undefined);
  }

  @Get('usuario/:userId')
  @ApiOperation({ summary: 'Auditoría filtrada por usuario específico' })
  getLogsByUser(
    @Param('userId', ParseIntPipe) userId: number,
    @Query() filtro: FiltroAuditoriaDto,
  ) {
    return this.auditoriaService.getLogsByUser(userId, filtro, this.empresaId ?? undefined);
  }

  @Get('modulo/:modulo')
  @ApiOperation({ summary: 'Auditoría filtrada por módulo' })
  getLogsByModulo(
    @Param('modulo') modulo: string,
    @Query() filtro: FiltroAuditoriaDto,
  ) {
    return this.auditoriaService.getLogsByModulo(modulo, filtro, this.empresaId ?? undefined);
  }
}
