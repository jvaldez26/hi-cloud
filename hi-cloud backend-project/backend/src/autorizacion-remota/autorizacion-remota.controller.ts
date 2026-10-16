import { Body, Controller, Get, Param, ParseIntPipe, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../tenant/tenant.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { User } from '../users/users.entity';
import { TenantService } from '../tenant/tenant.service';
import { obtenerIP } from '../auth/utils/obtener-ip.util';
import { AutorizacionRemotaService } from './autorizacion-remota.service';
import { CrearSolicitudAutorizacionRemotaDto, DecidirSolicitudAutorizacionRemotaDto } from './dto/crear-solicitud-autorizacion-remota.dto';

@ApiTags('Autorización remota de supervisor')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@Controller('autorizacion-remota')
export class AutorizacionRemotaController {
  constructor(
    private readonly svc: AutorizacionRemotaService,
    private readonly tenantService: TenantService,
  ) {}

  private get empresaId() { return this.tenantService.getEmpresaId(); }

  @Post()
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR)
  crear(@Body() dto: CrearSolicitudAutorizacionRemotaDto, @GetUser() cajero: User, @Req() req: Request) {
    return this.svc.crear(
      this.empresaId,
      { id: cajero.id, nombre: cajero.nombre, ip: obtenerIP(req), userAgent: req.headers['user-agent'] },
      this.tenantService.getSucursalId(),
      dto.cajaId ?? null,
      dto,
    );
  }

  @Get('pendientes')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  pendientes() {
    return this.svc.pendientes(this.empresaId);
  }

  @Get('historial')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  historial() {
    return this.svc.historial(this.empresaId);
  }

  // El propio cajero consulta el estado de SU solicitud mientras espera —
  // cualquier rol autenticado de la empresa puede leerla (el token solo se
  // puede USAR siendo ese mismo cajero, ver RequiereSupervisor), y un
  // ADMIN/CONTADOR también la lee desde "Ver solicitud" en la campanita.
  @Get(':id/estado')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR, UserRole.VIEWER)
  estado(@Param('id', ParseIntPipe) id: number) {
    return this.svc.estado(this.empresaId, id);
  }

  @Post(':id/decidir')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  decidir(@Param('id', ParseIntPipe) id: number, @Body() dto: DecidirSolicitudAutorizacionRemotaDto, @GetUser() supervisor: User, @Req() req: Request) {
    return this.svc.decidir(
      this.empresaId, id,
      { id: supervisor.id, nombre: supervisor.nombre, ip: obtenerIP(req), userAgent: req.headers['user-agent'] },
      dto,
    );
  }

  @Post(':id/cancelar')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR)
  cancelar(@Param('id', ParseIntPipe) id: number, @GetUser() cajero: User) {
    return this.svc.cancelar(this.empresaId, id, cajero.id).then(() => ({ ok: true }));
  }
}
