import {
  Controller,
  Get,
  Param,
  Query,
  ParseIntPipe,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { AuditoriaService } from './auditoria.service';
import { FiltroAuditoriaDto } from './dto/filtro-auditoria.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { TenantService } from '../tenant/tenant.service';
import { GetUser } from '../auth/decorators/get-user.decorator';
import type { User } from '../users/users.entity';

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
   * S-63: FALLA CERRADO. Antes usaba getEmpresaIdOrNull() y pasaba el null tal
   * cual al servicio, donde `if (empresaId)` omite el filtro: cualquier request
   * de un ADMIN o CONTADOR que llegara sin contexto de empresa recibía los logs
   * de TODAS las empresas. El bypass del TenantMiddleware por substring lo hacía
   * alcanzable con `GET /auditoria/modulo/admin`.
   *
   * Solo el super_admin puede consultar sin filtro — para él la vista global es
   * legítima y no tiene contexto de empresa.
   */
  private empresaIdPara(user: User): number | undefined {
    const empresaId = this.tenantService.getEmpresaIdOrNull();
    if (empresaId) return empresaId;

    if (user?.role === UserRole.SUPER_ADMIN) return undefined; // vista global legítima

    throw new ForbiddenException(
      'Se requiere contexto de empresa para consultar la auditoría.',
    );
  }

  @Get('resumen')
  @ApiOperation({ summary: 'Resumen: eventos por período, módulo, usuario y errores' })
  getResumen(@GetUser() user: User) {
    return this.auditoriaService.getResumen(this.empresaIdPara(user));
  }

  @Get('modulos')
  @ApiOperation({ summary: 'Lista de módulos distintos con logs registrados' })
  getModulos(@GetUser() user: User) {
    return this.auditoriaService.getModulosDistintos(this.empresaIdPara(user));
  }

  @Get('errores')
  @ApiOperation({ summary: 'Últimos errores del sistema (operaciones fallidas)' })
  @ApiQuery({ name: 'limite', required: false, example: 10 })
  getUltimosErrores(@GetUser() user: User, @Query('limite') limite?: number) {
    return this.auditoriaService.getUltimosErrores(Number(limite ?? 10), this.empresaIdPara(user));
  }

  @Get()
  @ApiOperation({ summary: 'Historial completo de auditoría con filtros' })
  getLogs(@Query() filtro: FiltroAuditoriaDto, @GetUser() user: User) {
    return this.auditoriaService.getLogs(filtro, this.empresaIdPara(user));
  }

  @Get('usuario/:userId')
  @ApiOperation({ summary: 'Auditoría filtrada por usuario específico' })
  getLogsByUser(
    @Param('userId', ParseIntPipe) userId: number,
    @Query() filtro: FiltroAuditoriaDto,
    @GetUser() user: User,
  ) {
    return this.auditoriaService.getLogsByUser(userId, filtro, this.empresaIdPara(user));
  }

  @Get('modulo/:modulo')
  @ApiOperation({ summary: 'Auditoría filtrada por módulo' })
  getLogsByModulo(
    @Param('modulo') modulo: string,
    @Query() filtro: FiltroAuditoriaDto,
    @GetUser() user: User,
  ) {
    return this.auditoriaService.getLogsByModulo(modulo, filtro, this.empresaIdPara(user));
  }
}
