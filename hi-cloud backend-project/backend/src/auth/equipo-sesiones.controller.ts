import { Controller, Get, Delete, Param, ParseIntPipe, UseGuards, Req, HttpCode, HttpStatus } from '@nestjs/common';
import type { Request } from 'express';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { Roles } from './decorators/roles.decorator';
import { GetUser } from './decorators/get-user.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { User } from '../users/users.entity';
import { TenantService } from '../tenant/tenant.service';
import { EquipoSesionesService } from './equipo-sesiones.service';
import { obtenerIP } from './utils/obtener-ip.util';

/**
 * Sesiones activas del EQUIPO — vista de administrador para destrabar a un
 * usuario cuya sesión quedó colgada, y supervisar quién tiene sesión abierta.
 *
 * Ruta deliberadamente fuera de /auth/ y /admin/: esas dos están en
 * RUTAS_SIN_TENANT (tenant.middleware.ts) y no tendrían contexto de CLS.
 * Esta SÍ pasa por TenantMiddleware, así que TenantService.getEmpresaId()
 * es seguro aquí — el empresaId nunca sale del request, siempre del CLS.
 *
 * @Roles(ADMIN) no es la única protección: RolesGuard solo confirma que el
 * SOLICITANTE pertenece a la empresa de su propio JWT. La pertenencia del
 * usuario OBJETIVO (el del :userId de la ruta) se valida aparte, en
 * EquipoSesionesService — el mismo eje que faltó en la escalada de
 * /multi-empresa (S-60/S-61): rol sin pertenencia del objetivo.
 */
@ApiTags('Sesiones del equipo')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('equipo/sesiones')
export class EquipoSesionesController {
  constructor(
    private svc: EquipoSesionesService,
    private tenantSvc: TenantService,
  ) {}

  @Get()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Sesiones activas de los usuarios de la empresa, agrupadas por usuario (solo admin)' })
  listar(@GetUser() user: User) {
    return this.svc.listar(this.tenantSvc.getEmpresaId(), user.id);
  }

  @Delete(':userId')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Cerrar la sesión activa de un usuario del equipo (solo roles por debajo de admin)' })
  async cerrar(
    @Param('userId', ParseIntPipe) userId: number,
    @GetUser() user: User,
    @Req() req: Request,
  ) {
    await this.svc.cerrarSesionDeUsuario(
      this.tenantSvc.getEmpresaId(),
      { id: user.id, nombre: user.nombre },
      userId,
      obtenerIP(req),
    );
    return { message: 'Sesión cerrada correctamente' };
  }
}
