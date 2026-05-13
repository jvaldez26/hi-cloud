import {
  Controller, Get, Patch, Post, Delete, Body, Param, ParseIntPipe,
  UseGuards, HttpCode, HttpStatus, Query, Res, Headers,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { IsEnum, IsInt, IsPositive, IsString, IsNotEmpty, IsOptional, IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { SuperAdminService } from './super-admin.service';
import { SuperAdminGuard }   from './super-admin.guard';
import { SuscripcionesService } from '../suscripciones/suscripciones.service';
import { BackupService } from './backup.service';
import { GetUser } from '../auth/decorators/get-user.decorator';
import type { User } from '../users/users.entity';

class CambiarPlanDto {
  @IsEnum(['trial','basico','profesional','empresarial','enterprise'])
  plan!: string;

  @IsInt() @IsPositive()
  meses!: number;
}

class UpdatePlanDto {
  @IsOptional() @IsString()         nombre?:      string;
  @IsOptional() @IsNumber() @Min(0) precio?:      number;
  @IsOptional() @IsString()         descripcion?: string;
}

class EnviarMensajeDto {
  @IsEnum(['INFO','ALERTA','PROMOCION','MANTENIMIENTO'])
  tipo!: string;

  @IsString() @IsNotEmpty()
  subject!: string;

  @IsString() @IsNotEmpty()
  mensaje!: string;
}

class CambiarRolDto {
  @IsEnum(['admin','contador','vendedor','viewer','super_admin'])
  rol!: string;
}

class BackupAlertDto {
  @IsString() @IsNotEmpty() mensaje!: string;
  @IsOptional() @IsString() tipo?: string;
}
class BackupSuccessDto {
  @IsString() @IsNotEmpty() archivo!: string;
  @IsString() @IsNotEmpty() tamanio!: string;
  @IsInt() @Type(() => Number)    duracion!: number;
  @IsOptional() @IsString()       checksum?: string;
}

@ApiTags('Super Admin')
@ApiBearerAuth('access-token')
@UseGuards(SuperAdminGuard)
@Controller('admin')
export class SuperAdminController {
  constructor(
    private svc:         SuperAdminService,
    private suscSvc:     SuscripcionesService,
    private backupSvc:   BackupService,
  ) {}

  @Get('metricas')
  @ApiOperation({ summary: 'Métricas globales de la plataforma' })
  getMetricas() { return this.svc.getMetricas(); }

  @Get('empresas')
  @ApiOperation({ summary: 'Listar todas las empresas con métricas' })
  listarEmpresas() { return this.svc.listarEmpresas(); }

  @Get('empresas/:id')
  @ApiOperation({ summary: 'Detalle de una empresa' })
  getEmpresa(@Param('id', ParseIntPipe) id: number) { return this.svc.getEmpresa(id); }

  @Patch('empresas/:id/suspender')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Suspender empresa' })
  suspender(@Param('id', ParseIntPipe) id: number) { return this.svc.suspenderEmpresa(id); }

  @Patch('empresas/:id/activar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Activar empresa' })
  activar(@Param('id', ParseIntPipe) id: number) { return this.svc.activarEmpresa(id); }

  @Patch('empresas/:id/plan')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cambiar plan de suscripción de una empresa' })
  cambiarPlan(@Param('id', ParseIntPipe) id: number, @Body() dto: CambiarPlanDto) {
    return this.svc.cambiarPlan(id, dto.plan, dto.meses);
  }

  @Post('empresas/:id/mensaje')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Enviar mensaje/notificación a una empresa' })
  enviarMensaje(@Param('id', ParseIntPipe) id: number, @Body() dto: EnviarMensajeDto) {
    return this.svc.enviarMensaje(id, dto.tipo, dto.subject, dto.mensaje);
  }

  @Delete('empresas/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Eliminar empresa (soft delete)' })
  eliminarEmpresa(@Param('id', ParseIntPipe) id: number) { return this.svc.eliminarEmpresa(id); }

  @Get('usuarios')
  @ApiOperation({ summary: 'Listar todos los usuarios del sistema' })
  listarUsuarios() { return this.svc.listarUsuarios(); }

  @Patch('usuarios/:id/rol')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cambiar rol global de un usuario' })
  cambiarRolUsuario(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CambiarRolDto,
    @GetUser() solicitante: User,
  ) {
    return this.svc.cambiarRolUsuario(id, dto.rol, solicitante.id);
  }

  @Delete('usuarios/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Eliminar usuario (soft delete — desactiva e-mail liberado)' })
  eliminarUsuario(
    @Param('id', ParseIntPipe) id: number,
    @GetUser() superAdmin: User,
  ) {
    return this.svc.eliminarUsuario(id, superAdmin.id);
  }

  @Get('suscripciones')
  @ApiOperation({ summary: 'Gestión de suscripciones y planes' })
  listarSuscripciones() { return this.svc.listarSuscripciones(); }

  // ── Configuración de planes (precio y nombre editable) ────────────────────

  @Get('planes')
  @ApiOperation({ summary: 'Obtener catálogo de planes con precios desde BD' })
  getPlanes() { return this.suscSvc.getPlanesCatalogo(); }

  @Patch('planes/:clave')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Actualizar nombre y/o precio de un plan — se propaga a toda la app' })
  updatePlan(@Param('clave') clave: string, @Body() dto: UpdatePlanDto) {
    return this.suscSvc.updatePlanConfig(clave, dto);
  }

  // ── Backups ──────────────────────────────────────────────────────────────

  @Get('backups')
  @ApiOperation({ summary: 'Listar backups con estadísticas' })
  listarBackups(@Query('page') page = '1') {
    return this.backupSvc.listar(Number(page));
  }

  @Get('backups/s3-status')
  @ApiOperation({ summary: 'Verificar estado del bucket S3 de backups' })
  s3Status() { return this.backupSvc.verificarS3(); }

  @Get('backups/s3-list')
  @ApiOperation({ summary: 'Listar archivos en S3' })
  s3List() { return this.backupSvc.listarEnS3(); }

  @Post('backups/trigger')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Disparar backup manual desde el panel' })
  triggerBackup(@GetUser() user: User) {
    return this.backupSvc.triggerManual(user.id);
  }

  @Get('backups/:id/download')
  @ApiOperation({ summary: 'URL de descarga temporal del backup (15 min)' })
  async downloadBackup(@Param('id', ParseIntPipe) id: number, @Res() res: Response) {
    const url = await this.backupSvc.getDownloadUrl(id);
    if (!url) {
      (res as any).status(404).json({ message: 'Backup no encontrado o S3 no configurado' });
      return;
    }
    (res as any).redirect(url);
  }

  // ── Endpoints internos (llamados por el script bash) ──────────────────────

  @Post('backups/internal/success')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '[Interno] Registrar backup exitoso — llamado por el script bash' })
  backupSuccess(
    @Headers('x-internal-key') key: string,
    @Body() dto: BackupSuccessDto,
  ) {
    if (key !== process.env.INTERNAL_API_KEY) return { error: 'No autorizado' };
    return this.backupSvc.registrarExito({
      s3Key:    dto.archivo,
      tamanio:  dto.tamanio,
      duracion: dto.duracion,
      checksum: dto.checksum,
    });
  }

  @Post('backups/internal/alert')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '[Interno] Registrar backup fallido — llamado por el script bash' })
  backupAlert(
    @Headers('x-internal-key') key: string,
    @Body() dto: BackupAlertDto,
  ) {
    if (key !== process.env.INTERNAL_API_KEY) return { error: 'No autorizado' };
    return this.backupSvc.registrarFallo({ mensaje: dto.mensaje, tipo: dto.tipo });
  }
}
