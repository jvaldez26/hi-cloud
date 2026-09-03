import {
  Controller, Get, Patch, Post, Delete,
  Param, Query, Body, UseGuards, HttpCode, HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';

import { JwtAuthGuard }    from '../auth/guards/jwt-auth.guard';
import { SuperAdminGuard } from '../super-admin/super-admin.guard';
import { GetUser }         from '../auth/decorators/get-user.decorator';
import { User }            from '../users/users.entity';

import { MensajesService }  from './mensajes.service';
import { CreateMensajeDto } from './dto/create-mensaje.dto';
import { UpdateMensajeDto } from './dto/update-mensaje.dto';

// ─── CLIENTE — bandeja de entrada del ERP ─────────────────────────────────────

@ApiTags('Mensajes / Bandeja')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('mensajes')
export class MensajesController {
  constructor(private readonly svc: MensajesService) {}

  @Get('bandeja')
  @ApiOperation({ summary: 'Mensajes de la bandeja del usuario activo' })
  getBandeja(
    @GetUser() usuario: User,
    @Query('tab') tab: 'principal' | 'novedades' | 'archivo' = 'principal',
  ) {
    return this.svc.getBandeja(usuario.id, tab);
  }

  @Get('no-leidos-count')
  @ApiOperation({ summary: 'Conteo de mensajes no leídos (para el badge del menú)' })
  getNoLeidosCount(@GetUser() usuario: User) {
    return this.svc.getNoLeidosCount(usuario.id).then(count => ({ count }));
  }

  @Get('no-vistos')
  @ApiOperation({ summary: 'IDs de mensajes (de cualquier tipo) cuyo toast aún no se ha mostrado al usuario' })
  getMensajesNoVistos(@GetUser() usuario: User) {
    return this.svc.getMensajesNoVistos(usuario.id).then(ids => ({ ids }));
  }

  /**
   * @deprecated Se llamaba así cuando solo devolvía novedades. Se mantiene
   * porque durante un despliegue hay pestañas abiertas con el bundle anterior
   * pidiendo esta ruta: sin el alias les daría 404 y perderían la notificación.
   * Quitar cuando ya no queden clientes viejos.
   */
  @Get('novedades-no-vistas')
  @ApiOperation({ summary: '[obsoleto] Alias de no-vistos' })
  getNovedadesNoVistas(@GetUser() usuario: User) {
    return this.svc.getMensajesNoVistos(usuario.id).then(ids => ({ ids }));
  }

  @Patch(':id/leer')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Marcar mensaje como leído' })
  marcarLeido(@Param('id') id: string, @GetUser() usuario: User) {
    return this.svc.marcarLeido(id, usuario.id);
  }

  @Post(':id/visto')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Registrar que el toast del mensaje fue mostrado (vistoEn)' })
  marcarVisto(@Param('id') id: string, @GetUser() usuario: User) {
    return this.svc.marcarVisto(id, usuario.id);
  }

  @Patch(':id/archivar')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Archivar mensaje' })
  archivar(@Param('id') id: string, @GetUser() usuario: User) {
    return this.svc.archivar(id, usuario.id);
  }

  @Patch('leer-todos')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Marcar todos los mensajes de una pestaña como leídos' })
  marcarTodosLeidos(
    @GetUser() usuario: User,
    @Query('tab') tab: 'principal' | 'novedades' = 'principal',
  ) {
    return this.svc.marcarTodosLeidos(usuario.id, tab);
  }

  @Patch(':id/desarchivar')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Quitar el archivado de un mensaje (vuelve a la pestaña de origen)' })
  desarchivar(@Param('id') id: string, @GetUser() usuario: User) {
    return this.svc.desarchivar(id, usuario.id);
  }

  @Patch(':id/eliminar')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete: ocultar mensaje de la bandeja del usuario' })
  eliminar(@Param('id') id: string, @GetUser() usuario: User) {
    return this.svc.eliminar(id, usuario.id);
  }

  @Post('eliminar-bulk')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete en lote: ocultar varios mensajes a la vez' })
  eliminarBulk(@Body('ids') ids: string[], @GetUser() usuario: User) {
    if (!Array.isArray(ids) || !ids.length) throw new BadRequestException('ids debe ser un array no vacío');
    return this.svc.eliminarBulk(ids, usuario.id);
  }

  @Post('desarchivar-bulk')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Desarchivar varios mensajes a la vez' })
  desarchivarBulk(@Body('ids') ids: string[], @GetUser() usuario: User) {
    if (!Array.isArray(ids) || !ids.length) throw new BadRequestException('ids debe ser un array no vacío');
    return this.svc.desarchivarBulk(ids, usuario.id);
  }
}

// ─── SUPER ADMIN — gestión y publicación de mensajes ─────────────────────────

@ApiTags('Mensajes / Admin')
@UseGuards(SuperAdminGuard)
@Controller('mensajes/admin')
export class MensajesAdminController {
  constructor(private readonly svc: MensajesService) {}

  @Get()
  @ApiOperation({ summary: 'Listar todos los mensajes con estadísticas de lectura' })
  listar() {
    return this.svc.adminListar();
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Crear y publicar un mensaje (o programarlo)' })
  crear(@Body() dto: CreateMensajeDto, @GetUser() usuario: User) {
    return this.svc.adminCrear(dto, usuario.id);
  }

  @Patch(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Editar mensaje (incluye mensajes ya publicados; registra editadoEn)' })
  editar(@Param('id') id: string, @Body() dto: UpdateMensajeDto) {
    return this.svc.adminEditar(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Desactivar mensaje (soft delete)' })
  desactivar(@Param('id') id: string) {
    return this.svc.adminDesactivar(id);
  }

  @Get(':id/stats')
  @ApiOperation({ summary: 'Estadísticas de lectura de un mensaje' })
  stats(@Param('id') id: string) {
    return this.svc.adminStats(id);
  }
}
