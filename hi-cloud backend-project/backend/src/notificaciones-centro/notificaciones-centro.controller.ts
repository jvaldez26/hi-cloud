import { Controller, Get, Post, Patch, Param, Query, Body, ParseIntPipe, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiHeader } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsString } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { NotificacionesCentroService } from './notificaciones-centro.service';

class GuardarPreferenciaDto {
  @IsString() @IsNotEmpty()
  tipo: string;

  @IsBoolean()
  activo: boolean;
}

@ApiTags('Centro de Notificaciones')
@ApiBearerAuth('access-token')
@ApiHeader({ name: 'X-Empresa-ID', required: true })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR, UserRole.VIEWER)
@Controller('notificaciones-centro')
export class NotificacionesCentroController {
  constructor(private readonly svc: NotificacionesCentroService) {}

  @Get()
  @ApiOperation({ summary: 'Eventos + alertas unificados, filtrados por rol y preferencias del usuario' })
  obtener(@Query('soloNoAtendidas') soloNoAtendidas?: string) {
    return this.svc.obtener({ soloNoAtendidas: soloNoAtendidas === '1' || soloNoAtendidas === 'true' });
  }

  @Get('resumen')
  @ApiOperation({ summary: 'Solo los contadores — para el badge de la campanita' })
  resumen() {
    return this.svc.resumen();
  }

  @Post('eventos/:id/leido')
  marcarEventoLeido(@Param('id', ParseIntPipe) id: number) {
    return this.svc.marcarEventoLeido(id).then(() => ({ ok: true }));
  }

  @Post('eventos/marcar-todo-leido')
  marcarTodoLeido() {
    return this.svc.marcarTodoLeido().then(n => ({ ok: true, marcados: n }));
  }

  @Post('alertas/:tipo/visto')
  marcarAlertaVista(@Param('tipo') tipo: string) {
    return this.svc.marcarAlertaVista(tipo, false).then(() => ({ ok: true }));
  }

  @Post('alertas/:tipo/posponer')
  posponerAlerta(@Param('tipo') tipo: string) {
    return this.svc.marcarAlertaVista(tipo, true).then(() => ({ ok: true }));
  }

  @Get('preferencias')
  @ApiOperation({ summary: 'Mi Perfil → Notificaciones: tipos visibles para el rol, con su estado actual' })
  obtenerPreferencias() {
    return this.svc.obtenerPreferencias();
  }

  @Patch('preferencias')
  @ApiOperation({ summary: 'Activa o desactiva un tipo de notificación para el usuario autenticado' })
  guardarPreferencia(@Body() dto: GuardarPreferenciaDto) {
    return this.svc.guardarPreferencia(dto.tipo, dto.activo).then(() => ({ ok: true }));
  }
}
