import {
  Controller, Get, Patch, Post, Delete, Body, Param, ParseIntPipe,
  UseGuards, HttpCode, HttpStatus, Query, Res, Headers,
} from '@nestjs/common';

import type { Response } from 'express';
import { timingSafeEqual } from 'crypto';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { IsEnum, IsInt, IsPositive, IsString, IsNotEmpty, IsOptional, IsNumber, Min, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';
import { SuperAdminService } from './super-admin.service';
import { SuperAdminGuard }   from './super-admin.guard';
import { SuscripcionesService } from '../suscripciones/suscripciones.service';
import { BackupService } from './backup.service';
import { ContabilidadService } from '../contabilidad/services/contabilidad.service';
import { ModulosAddonService } from '../modulos-addon/modulos-addon.service';
import { GetUser } from '../auth/decorators/get-user.decorator';
import type { User } from '../users/users.entity';

class CambiarPlanDto {
  @IsEnum(['trial','emprendedor','pyme','pro','plus','basico','profesional','empresarial','enterprise'])
  plan!: string;

  @IsInt() @IsPositive()
  meses!: number;

  @IsOptional() @IsString()
  motivo?: string;

  @IsOptional() @IsInt()
  solicitudId?: number;
}

class ExtenderTrialDto {
  @IsInt() @IsPositive()
  dias!: number;

  @IsString() @IsNotEmpty()
  motivo!: string;
}

class SuspenderDto {
  @IsString() @IsNotEmpty()
  motivo!: string;
}

/** Motivo opcional — el endpoint de suspender empresa se llamaba sin body. */
class SuspenderEmpresaDto {
  @IsOptional() @IsString()
  motivo?: string;
}

class DescuentoDto {
  @IsNumber() @Min(1)
  pct!: number;

  @IsOptional() @IsString()
  hasta?: string;

  @IsString() @IsNotEmpty()
  motivo!: string;
}

class RechazarSolicitudDto {
  @IsString() @IsNotEmpty()
  motivo!: string;
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

class HardDeleteDto {
  @IsString() @IsNotEmpty()
  confirmacion!: string;
}

class RechazarRegistroDto {
  @IsOptional() @IsString()
  motivo?: string;
}

class UpdateConfigGlobalDto {
  @IsString() @IsNotEmpty()
  valor!: string;
}

class GestionModuloDto {
  @IsString() @IsNotEmpty()
  codigo!: string;

  @IsOptional() @IsString()
  fechaVencimiento?: string;

  @IsOptional() @IsString()
  notas?: string;
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

class SincronizarPlanCuentasDto {
  @IsOptional() @IsInt() @IsPositive()
  empresaId?: number;
}

class VencimientoManualDto {
  @IsDateString()
  fecha!: string;

  @IsString() @IsNotEmpty()
  motivo!: string;
}

class ResetVencimientoDto {
  @IsString() @IsNotEmpty()
  motivo!: string;
}

/**
 * S-64: compara la clave interna del script de backups en tiempo constante y
 * FALLA CERRADO. Antes era `key !== process.env.INTERNAL_API_KEY`: si la variable
 * no estaba definida en el entorno, un request sin el header comparaba
 * `undefined !== undefined` → false, y la petición se daba por autorizada.
 */
export function claveInternaValida(key?: string): boolean {
  const esperada = process.env.INTERNAL_API_KEY;
  if (!esperada || !key) return false;

  const a = Buffer.from(String(key));
  const b = Buffer.from(esperada);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

@ApiTags('Super Admin')
@ApiBearerAuth('access-token')
@UseGuards(SuperAdminGuard)
@Controller('admin')
export class SuperAdminController {
  constructor(
    private svc:              SuperAdminService,
    private suscSvc:          SuscripcionesService,
    private backupSvc:        BackupService,
    private contabilidadSvc:  ContabilidadService,
    private modulosSvc:       ModulosAddonService,
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
  suspender(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SuspenderEmpresaDto,
    @GetUser() admin: User,
  ) {
    return this.svc.suspenderEmpresa(id, admin.id, dto?.motivo);
  }

  @Patch('empresas/:id/activar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Activar empresa' })
  activar(@Param('id', ParseIntPipe) id: number, @GetUser() admin: User) {
    return this.svc.activarEmpresa(id, admin.id);
  }

  @Patch('empresas/:id/plan')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cambiar plan de suscripción de una empresa' })
  cambiarPlan(@Param('id', ParseIntPipe) id: number, @Body() dto: CambiarPlanDto, @GetUser() admin: User) {
    return this.svc.cambiarPlanConAuditoria(id, dto.plan, dto.meses, admin.id, dto.solicitudId ?? null, dto.motivo ?? 'Cambio manual');
  }

  // ── Gestión avanzada de suscripciones ──────────────────────────────────────

  @Post('empresas/:id/extender-trial')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Extender período de trial' })
  extenderTrial(@Param('id', ParseIntPipe) id: number, @Body() dto: ExtenderTrialDto, @GetUser() admin: User) {
    return this.svc.extenderTrial(id, dto.dias, admin.id, dto.motivo);
  }

  @Patch('empresas/:id/suspender-suscripcion')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Suspender suscripción de una empresa' })
  suspenderSuscripcion(@Param('id', ParseIntPipe) id: number, @Body() dto: SuspenderDto, @GetUser() admin: User) {
    return this.svc.suspenderSuscripcion(id, admin.id, dto.motivo);
  }

  @Patch('empresas/:id/reactivar-suscripcion')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reactivar suscripción suspendida' })
  reactivarSuscripcion(@Param('id', ParseIntPipe) id: number, @Body() dto: SuspenderDto, @GetUser() admin: User) {
    return this.svc.reactivarSuscripcion(id, admin.id, dto.motivo);
  }

  @Post('empresas/:id/descuento')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Aplicar descuento porcentual a suscripción' })
  aplicarDescuento(@Param('id', ParseIntPipe) id: number, @Body() dto: DescuentoDto, @GetUser() admin: User) {
    return this.svc.aplicarDescuento(id, dto.pct, dto.hasta ?? null, admin.id, dto.motivo);
  }

  @Get('empresas/:id/auditoria')
  @ApiOperation({ summary: 'Historial de cambios de suscripción de una empresa' })
  getAuditoria(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getAuditoria(id);
  }

  @Patch('empresas/:id/vencimiento-manual')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Fijar fecha de vencimiento manual para empresa ACTIVA (persiste sobre pagos y crons)' })
  setVencimientoManual(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: VencimientoManualDto,
    @GetUser() admin: User,
  ) {
    return this.svc.setVencimientoManual(id, dto.fecha, dto.motivo, admin.id);
  }

  @Delete('empresas/:id/vencimiento-manual')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Restablecer vencimiento automático — elimina el override manual' })
  resetVencimientoManual(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ResetVencimientoDto,
    @GetUser() admin: User,
  ) {
    return this.svc.resetVencimientoManual(id, dto.motivo, admin.id);
  }

  // ── Solicitudes de cambio de plan ─────────────────────────────────────────

  @Get('suscripciones/solicitudes')
  @ApiOperation({ summary: 'Listar solicitudes de cambio de plan pendientes' })
  listarSolicitudes(@Query('estado') estado?: string) {
    return this.svc.listarSolicitudes(estado);
  }

  @Post('suscripciones/solicitudes/:id/aprobar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Aprobar solicitud de cambio de plan' })
  aprobarSolicitud(@Param('id', ParseIntPipe) id: number, @Body() dto: CambiarPlanDto, @GetUser() admin: User) {
    // S-64: antes pasaba empresaId=0 — marcaba la solicitud aprobada sin aplicar
    // el plan a ninguna empresa. Ahora el empresaId se resuelve de la solicitud.
    return this.svc.aprobarSolicitudCambioPlan(
      id, dto.plan, dto.meses, admin.id, dto.motivo ?? 'Solicitud aprobada',
    );
  }

  @Post('suscripciones/solicitudes/:id/rechazar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rechazar solicitud de cambio de plan' })
  rechazarSolicitud(@Param('id', ParseIntPipe) id: number, @Body() dto: RechazarSolicitudDto, @GetUser() admin: User) {
    return this.svc.rechazarSolicitud(id, admin.id, dto.motivo);
  }

  // ── Reportes MRR/ARR en USD ───────────────────────────────────────────────

  @Get('suscripciones/mrr')
  @ApiOperation({ summary: 'MRR y ARR en USD con distribución por plan' })
  getMrrArr() {
    return this.svc.getMrrArr();
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
  eliminarEmpresa(@Param('id', ParseIntPipe) id: number, @GetUser() admin: User) {
    return this.svc.eliminarEmpresa(id, admin.id);
  }

  @Get('usuarios')
  @ApiOperation({ summary: 'Listar todos los usuarios del sistema' })
  listarUsuarios() { return this.svc.listarUsuarios(); }

  // S-62: GET usuarios/verification-token eliminado. Era un endpoint [Testing] que
  // devolvía el token de verificación de email de CUALQUIER usuario: permitía
  // completar la verificación de una cuenta ajena sin acceder a su correo. Sin
  // consumidores en el frontend. Para diagnóstico, consultar la BD directamente.

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

  @Patch('usuarios/:id/suspender')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Suspender usuario — desactiva el acceso sin eliminar datos' })
  suspenderUsuario(@Param('id', ParseIntPipe) id: number, @GetUser() admin: User) {
    return this.svc.suspenderUsuario(id, admin.id);
  }

  @Patch('usuarios/:id/activar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reactivar usuario suspendido' })
  activarUsuario(@Param('id', ParseIntPipe) id: number, @GetUser() admin: User) {
    return this.svc.activarUsuario(id, admin.id);
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

  @Delete('usuarios/:id/permanente')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Eliminar usuario PERMANENTEMENTE — requiere confirmación textual' })
  eliminarUsuarioPermanente(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: HardDeleteDto,
    @GetUser() admin: User,
  ) {
    return this.svc.eliminarUsuarioPermanente(id, admin.id, dto.confirmacion);
  }

  @Delete('empresas/:id/permanente')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Eliminar empresa PERMANENTEMENTE — requiere confirmación textual' })
  eliminarEmpresaPermanente(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: HardDeleteDto,
    @GetUser() admin: User,
  ) {
    return this.svc.eliminarEmpresaPermanente(id, admin.id, dto.confirmacion);
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
  async updatePlan(@Param('clave') clave: string, @Body() dto: UpdatePlanDto, @GetUser() admin: User) {
    // S-64: cambiar el precio de un plan afecta la facturación de TODOS los
    // clientes de ese plan y no dejaba ningún rastro de quién lo hizo.
    const catalogo = await this.suscSvc.getPlanesCatalogo();
    const antes    = (catalogo as any[]).find(p => p.clave === clave) ?? null;

    const res = await this.suscSvc.updatePlanConfig(clave, dto);

    await this.svc.auditarCambioPlanCatalogo(
      clave,
      antes ? {
        nombre:        antes.nombre,
        precioMensual: antes.precioMensual,
      } : null,
      { ...dto },
      admin.id,
    );
    return res;
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
  async downloadBackup(@Param('id', ParseIntPipe) id: number, @Res() res: Response, @GetUser() user: any) {
    const url = await this.backupSvc.getDownloadUrl(id, user?.id);
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
    if (!claveInternaValida(key)) return { error: 'No autorizado' };
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
    if (!claveInternaValida(key)) return { error: 'No autorizado' };
    return this.backupSvc.registrarFallo({ mensaje: dto.mensaje, tipo: dto.tipo });
  }

  // ── Crons manuales (testing / forzar ejecución) ────────────────────────────

  @Post('suscripciones/ejecutar-cron/vencimientos')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Ejecutar manualmente el cron de vencimientos de prueba' })
  async ejecutarCronVencimientos() {
    await this.suscSvc.procesarVencimientosPrueba();
    return { ok: true, cron: 'vencimientos' };
  }

  @Post('suscripciones/ejecutar-cron/recordatorios')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Ejecutar manualmente el cron de recordatorios (5d y 1d)' })
  async ejecutarCronRecordatorios() {
    await this.suscSvc.enviarRecordatoriosPrueba();
    return { ok: true, cron: 'recordatorios' };
  }

  // S-65: eliminados PATCH suscripciones/:empresaId/fecha-fin-prueba e
  // .../ingresos-mes. Eran endpoints [Testing] que en producción escribían
  // directamente sobre la facturación de un cliente (fecha de fin de prueba e
  // ingresos del mes, que gobiernan los límites del plan) saltándose la lógica de
  // negocio y sin dejar auditoría. Sin consumidores en el frontend. Para pruebas,
  // usar los endpoints de negocio: extender-trial y vencimiento-manual.

  // ── Registros pendientes de aprobación ─────────────────────────────────────

  @Get('registros-pendientes')
  @ApiOperation({ summary: 'Listar usuarios pendientes de aprobación' })
  listarPendientes() { return this.svc.listarRegistrosPendientes(); }

  @Get('registros-pendientes/count')
  @ApiOperation({ summary: 'Contar usuarios pendientes de aprobación (para badge)' })
  contarPendientes() { return this.svc.contarRegistrosPendientes(); }

  @Post('registros-pendientes/:id/aprobar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Aprobar solicitud de registro — activa la cuenta y envía email de bienvenida' })
  aprobarRegistro(@Param('id', ParseIntPipe) id: number, @GetUser() admin: User) {
    return this.svc.aprobarRegistro(id, admin.id);
  }

  @Post('registros-pendientes/:id/rechazar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rechazar solicitud de registro — desactiva la cuenta y envía email con motivo' })
  rechazarRegistro(
    @Param('id', ParseIntPipe) id: number,
    @GetUser() admin: User,
    @Body() dto: RechazarRegistroDto,
  ) {
    return this.svc.rechazarRegistro(id, admin.id, dto.motivo ?? '');
  }

  // ── Aprobación de nuevas empresas ─────────────────────────────────────────

  @Get('empresas-pendientes-aprobacion')
  @ApiOperation({ summary: 'Listar empresas pendientes de aprobación por Super Admin' })
  empresasPendientes() { return this.svc.getEmpresasPendientesAprobacion(); }

  @Post('empresas/:id/aprobar-empresa')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Aprobar empresa — activa, crea Trial 15 días, envía email' })
  aprobarEmpresa(@Param('id', ParseIntPipe) id: number, @GetUser() admin: User) {
    return this.svc.aprobarEmpresa(id, admin.id);
  }

  @Post('empresas/:id/rechazar-empresa')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rechazar empresa — guarda motivo y envía email al solicitante' })
  rechazarEmpresa(
    @Param('id', ParseIntPipe) id: number,
    @GetUser() admin: User,
    @Body() dto: RechazarRegistroDto,
  ) {
    return this.svc.rechazarEmpresa(id, admin.id, dto.motivo ?? 'Sin motivo especificado');
  }

  // ── Plan de Cuentas — Re-sembrado ─────────────────────────────────────────

  @Post('contabilidad/plan-cuentas/sincronizar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sincronizar plan de cuentas — agrega cuentas faltantes a empresas existentes sin borrar las configuradas' })
  sincronizarPlanCuentas(@Body() dto: SincronizarPlanCuentasDto) {
    return this.contabilidadSvc.sincronizarPlanCuentasTodas(dto.empresaId);
  }

  // ── Módulos Add-on ────────────────────────────────────────────────────────

  @Get('modulos')
  @ApiOperation({ summary: 'Listar todos los módulos add-on disponibles' })
  listarModulosAddon() {
    return this.modulosSvc.listarModulos();
  }

  @Get('modulos/activaciones')
  @ApiOperation({ summary: 'Vista global de activaciones de módulos por empresa' })
  getActivacionesGlobal() {
    return this.modulosSvc.getActivacionesGlobal();
  }

  @Get('empresas/:id/modulos')
  @ApiOperation({ summary: 'Listar módulos activados para una empresa' })
  getModulosEmpresa(@Param('id', ParseIntPipe) id: number) {
    return this.modulosSvc.getModulosEmpresa(id);
  }

  @Post('empresas/:id/modulos/activar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Activar un módulo add-on para una empresa' })
  activarModulo(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: GestionModuloDto,
    @GetUser() admin: User,
  ) {
    return this.modulosSvc.activarModulo(id, dto.codigo, admin.id, dto.fechaVencimiento, dto.notas);
  }

  @Post('empresas/:id/modulos/desactivar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Desactivar un módulo add-on de una empresa' })
  async desactivarModulo(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: Pick<GestionModuloDto, 'codigo'>,
    @GetUser() admin: User,
  ) {
    const res = await this.modulosSvc.desactivarModulo(id, dto.codigo);
    // S-64: activarModulo guarda "activadoPor", pero desactivar no registraba nada.
    // empresa_modulos no tiene columna desactivadoPor, así que el rastro va a la
    // auditoría en vez de exigir una migración.
    await this.svc.auditarCambioModuloAddon(id, dto.codigo, 'DESACTIVACION_MODULO', admin.id);
    return res;
  }

  // ── Facturas Recurrentes — Diagnóstico y Reparación ────────────────────────

  @Get('facturas-recurrentes/diagnostico')
  @ApiOperation({ summary: 'Diagnosticar plantillas recurrentes y facturas con montos cero' })
  async diagnosticoRecurrentes() {
    return this.svc.diagnosticoFacturasRecurrentes();
  }

  @Post('facturas-recurrentes/reparar-montos')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reparar facturas recurrentes con total = 0 usando precios de productos' })
  async repararMontosRecurrentes() {
    return this.svc.repararMontosRecurrentes();
  }

  // ── Configuración Global de Seguridad ──────────────────────────────────────

  @Get('configuracion-global')
  @ApiOperation({ summary: 'Leer parámetros globales de seguridad (solo Super Admin)' })
  getConfiguracionGlobal() {
    return this.svc.getConfiguracionGlobal();
  }

  @Patch('configuracion-global/:clave')
  @ApiOperation({ summary: 'Actualizar parámetro global de seguridad (solo Super Admin)' })
  updateConfiguracionGlobal(
    @Param('clave') clave: string,
    @Body() dto: UpdateConfigGlobalDto,
  ) {
    return this.svc.updateConfiguracionGlobal(clave, dto.valor);
  }

}
