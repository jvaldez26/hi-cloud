import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards, ParseIntPipe } from '@nestjs/common';
import { EnfermeriaService } from './enfermeria.service';
import { CreateVisitaEnfermeriaDto, UpdateVisitaEnfermeriaDto, FiltrosEnfermeriaDto } from './dto/enfermeria.dto';
import { JwtAuthGuard }     from '../../auth/guards/jwt-auth.guard';
import { RolesGuard }       from '../../auth/guards/roles.guard';
import { TenantGuard }      from '../../tenant/tenant.guard';
import { ModuloAddonGuard } from '../../modulos-addon/guards/modulo-addon.guard';
import { TenantService }    from '../../tenant/tenant.service';
import { Roles }            from '../../auth/decorators/roles.decorator';
import { UserRole }         from '../../users/enums/user-role.enum';

/**
 * Datos médicos de menores — acceso restringido a UserRole.ADMIN (no hay
 * rol "enfermería"/"dirección" propio en el sistema hoy; ver
 * feedback_educativo_enfermeria_acceso en memoria). super_admin siempre
 * pasa (RolesGuard). Un docente recibe 403 antes de llegar al service.
 */
@UseGuards(JwtAuthGuard, RolesGuard, TenantGuard, ModuloAddonGuard('educativo'))
@Roles(UserRole.ADMIN)
@Controller('educativo/enfermeria')
export class EnfermeriaController {
  constructor(
    private readonly svc: EnfermeriaService,
    private readonly tenantSvc: TenantService,
  ) {}

  private get empresaId() { return this.tenantSvc.getEmpresaId(); }

  @Get()
  list(@Query() filtros: FiltrosEnfermeriaDto) {
    return this.svc.list(this.empresaId, filtros);
  }

  @Get('estudiante/:estudianteId')
  expediente(@Param('estudianteId', ParseIntPipe) estudianteId: number) {
    return this.svc.expedienteEstudiante(this.empresaId, estudianteId);
  }

  @Get('estudiante/:estudianteId/contexto-medico')
  contextoMedico(@Param('estudianteId', ParseIntPipe) estudianteId: number) {
    return this.svc.contextoMedico(this.empresaId, estudianteId);
  }

  @Post()
  create(@Body() dto: CreateVisitaEnfermeriaDto) {
    return this.svc.create(this.empresaId, dto);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateVisitaEnfermeriaDto) {
    return this.svc.update(this.empresaId, id, dto);
  }
}
