import { Controller, Get, Post, Patch, Body, Param, Query, ParseIntPipe, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../tenant/tenant.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../users/enums/user-role.enum';
import { ModuloAddonGuard } from '../../modulos-addon/guards/modulo-addon.guard';
import { TenantService } from '../../tenant/tenant.service';
import { SolicitudesService } from './solicitudes.service';
import { CrearSolicitudDto, DecidirSolicitudDto, ActualizarSolicitudDto } from '../dto/prestamista.dto';

@Controller('prestamista/solicitudes')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard, ModuloAddonGuard('prestamista'))
@ApiTags('Prestamista - Solicitudes')
@ApiBearerAuth()
export class SolicitudesController {
  constructor(private readonly svc: SolicitudesService, private readonly tenantSvc: TenantService) {}
  private get empresaId() { return this.tenantSvc.getEmpresaId(); }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR, UserRole.VIEWER)
  findAll(@Query() q: any) { return this.svc.findAll(this.empresaId, q); }
  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR, UserRole.VIEWER)
  findOne(@Param('id', ParseIntPipe) id: number) { return this.svc.findOne(this.empresaId, id); }
  // Crear solicitud: operador básico o superior.
  @Post()
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR)
  create(@Body() body: CrearSolicitudDto) { return this.svc.create(this.empresaId, body); }
  // PATCH genérico: solo campos NO sensibles (la decisión va por /decidir).
  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR)
  update(@Param('id', ParseIntPipe) id: number, @Body() body: ActualizarSolicitudDto) { return this.svc.update(this.empresaId, id, body); }
  // Aprobar/rechazar: supervisión (no existe rol SUPERVISOR → CONTADOR/ADMIN).
  // La segregación (creador != aprobador) se valida en el service.
  @Post(':id/decidir')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  decidir(@Param('id', ParseIntPipe) id: number, @Body() body: DecidirSolicitudDto) { return this.svc.decidir(this.empresaId, id, body); }
}
