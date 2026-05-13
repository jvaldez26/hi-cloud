import { PlanGuard } from '../suscripciones/guards/plan.guard';
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
import { GetUser } from '../auth/decorators/get-user.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { User } from '../users/users.entity';
import { RequiereModulo } from '../suscripciones/decorators/requiere-modulo.decorator';
import { TenantService } from '../tenant/tenant.service';

@ApiTags('Auditoría y Logs')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@UseGuards(PlanGuard)
@RequiereModulo('auditoria')
@Controller('auditoria')
export class AuditoriaController {
  constructor(
    private auditoriaService: AuditoriaService,
    private tenantService:    TenantService,
  ) {}

  @Get('resumen')
  @ApiOperation({ summary: 'Resumen: eventos por período, por módulo, por usuario y errores' })
  getResumen() {
    const empresaId = this.tenantService.getEmpresaId();
    return this.auditoriaService.getResumen(empresaId);
  }

  @Get('errores')
  @ApiOperation({ summary: 'Últimos errores del sistema (últimas 10 operaciones fallidas)' })
  @ApiQuery({ name: 'limite', required: false, example: 10 })
  getUltimosErrores(@Query('limite') limite?: number) {
    const empresaId = this.tenantService.getEmpresaId();
    return this.auditoriaService.getUltimosErrores(Number(limite ?? 10), empresaId);
  }

  @Get()
  @ApiOperation({ summary: 'Historial completo de auditoría con filtros' })
  getLogs(@Query() filtro: FiltroAuditoriaDto) {
    const empresaId = this.tenantService.getEmpresaId();
    return this.auditoriaService.getLogs(filtro, empresaId);
  }

  @Get('usuario/:userId')
  @ApiOperation({ summary: 'Auditoría filtrada por usuario específico' })
  getLogsByUser(
    @Param('userId', ParseIntPipe) userId: number,
    @Query() filtro: FiltroAuditoriaDto,
  ) {
    const empresaId = this.tenantService.getEmpresaId();
    return this.auditoriaService.getLogsByUser(userId, filtro, empresaId);
  }

  @Get('modulo/:modulo')
  @ApiOperation({ summary: 'Auditoría filtrada por módulo (facturas, compras, nomina, etc.)' })
  getLogsByModulo(
    @Param('modulo') modulo: string,
    @Query() filtro: FiltroAuditoriaDto,
  ) {
    const empresaId = this.tenantService.getEmpresaId();
    return this.auditoriaService.getLogsByModulo(modulo, filtro, empresaId);
  }
}
