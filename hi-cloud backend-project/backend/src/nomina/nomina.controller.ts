import { PlanGuard } from '../suscripciones/guards/plan.guard';
import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  ParseIntPipe,
  ParseFloatPipe,
  HttpCode,
  HttpStatus,
  UseGuards,
  Res,
  Logger,
  HttpException,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { IsString, IsOptional, IsEnum, IsNumber, IsInt, IsPositive, Min, IsBoolean, ValidateIf } from 'class-validator';
import { NominaService } from './nomina.service';
import { TipoContrato } from './entities/empleado.entity';
import { NominaCalculosService } from './services/nomina-calculos.service';
import { CreateEmpleadoDto } from './dto/create-empleado.dto';
import { UpdateEmpleadoDto } from './dto/update-empleado.dto';
import { CreateNominaPeriodoDto } from './dto/create-nomina-periodo.dto';
import { FiltroEmpleadoDto, FiltroNominaPeriodoDto } from './dto/filtro-nomina.dto';
import { TipoNovedad } from './entities/nomina-novedad.entity';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { User } from '../users/users.entity';
import { RequiereModulo } from '../suscripciones/decorators/requiere-modulo.decorator';

class VincularUsuarioDto {
  @ValidateIf(o => o.userId !== null)
  @IsOptional() @IsInt() @IsPositive()
  userId!: number | null;
}

class InvitarPortalDto {
  /** Email opcional — si se omite, se usa el email del empleado */
  @IsOptional() @IsString()
  email?: string;
}

class CreateNovedadDto {
  @IsInt() @IsPositive()                empleadoId!:   number;
  @IsOptional() @IsInt() @IsPositive()  periodoId?:    number;
  @IsEnum(TipoNovedad)                  tipo!:         TipoNovedad;
  @IsString()                           descripcion!:  string;
  @IsOptional() @IsNumber() @Min(0)     monto?:        number;
  @IsOptional() @IsInt() @Min(0)        horasExtras?:  number;
}

class CreateContratoDto {
  @IsInt() @IsPositive()                empleadoId!:   number;
  @IsOptional() @IsString()             numero?:       string;
  @IsEnum(TipoContrato)                 tipo!:         TipoContrato;
  @IsString()                           fechaInicio!:  string;
  @IsOptional() @IsString()             fechaFin?:     string;
  @IsNumber() @Min(0)                   salario!:      number;
  @IsString()                           cargo!:        string;
  @IsOptional() @IsString()             departamento?: string;
  @IsOptional() @IsString()             clausulas?:    string;
  @IsOptional() @IsString()             lugarTrabajo?: string;
  @IsOptional() @IsInt() @Min(1)        horasSemana?:  number;
}

class UpdateContratoDto {
  @IsOptional() @IsString()  estado?:    string;
  @IsOptional() @IsString()  clausulas?: string;
  @IsOptional() @IsString()  fechaFin?:  string;
}

class CreatePrestamoDto {
  @IsInt() @IsPositive()            empleadoId!:      number;
  @IsNumber() @Min(0.01)            monto!:           number;
  @IsInt() @Min(1)                  cuotas!:          number;
  @IsString()                       fechaDesembolso!: string;
  @IsOptional() @IsString()         descripcion?:     string;
}

class CreateAnticipoDto {
  @IsInt() @IsPositive()            empleadoId!:       number;
  @IsNumber() @Min(0.01)            monto!:            number;
  @IsString()                       periodoDescontar!: string;
  @IsOptional() @IsString()         descripcion?:      string;
}

@ApiTags('Nómina y Recursos Humanos')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@UseGuards(PlanGuard)
@RequiereModulo('nomina')
@Controller('nomina')
export class NominaController {
  private readonly logger = new Logger(NominaController.name);

  constructor(
    private nominaService: NominaService,
    private calculos: NominaCalculosService,
  ) {}

  // ── Resumen General ────────────────────────────────────────────────────────

  @Get('resumen')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Resumen general: empleados activos, último período pagado, novedades pendientes' })
  getResumen() {
    return this.nominaService.getResumenNomina();
  }

  // ── Utilidades de cálculo ──────────────────────────────────────────────────

  @Get('tasas-tss')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Tasas TSS vigentes (Ley 87-01), ISR (DGII), horas extras (Art. 147 CT-RD)' })
  getTasas() {
    return this.calculos.getTasas();
  }

  @Get('simular')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Simular nómina para un salario dado' })
  @ApiQuery({ name: 'salario',         required: true,  example: 50000 })
  @ApiQuery({ name: 'diasTrabajados',  required: false, example: 30 })
  @ApiQuery({ name: 'otrasDeduciones', required: false, example: 0 })
  @ApiQuery({ name: 'horasExtras',     required: false, example: 0 })
  simular(
    @Query('salario', ParseFloatPipe) salario: number,
    @Query('diasTrabajados')  diasTrabajados  = 30,
    @Query('otrasDeduciones') otrasDeduciones = 0,
    @Query('horasExtras')     horasExtras     = 0,
  ) {
    return this.calculos.simular(
      salario,
      Number(diasTrabajados),
      30,
      Number(otrasDeduciones),
      Number(horasExtras),
    );
  }

  // ── Catálogos: Departamentos y Cargos ──────────────────────────────────────

  @Get('departamentos')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Listar departamentos del catálogo' })
  listarDepartamentos() {
    return this.nominaService.listarDepartamentos();
  }

  @Post('departamentos')
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Crear departamento en el catálogo' })
  crearDepartamento(@Body('nombre') nombre: string) {
    if (!nombre?.trim()) throw new HttpException('El nombre es requerido', HttpStatus.BAD_REQUEST);
    return this.nominaService.crearDepartamento(nombre.trim());
  }

  @Delete('departamentos/:id')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Eliminar departamento (solo si no tiene empleados asignados)' })
  eliminarDepartamento(@Param('id', ParseIntPipe) id: number) {
    return this.nominaService.eliminarDepartamento(id);
  }

  @Get('cargos')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Listar cargos del catálogo' })
  listarCargos() {
    return this.nominaService.listarCargos();
  }

  @Post('cargos')
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Crear cargo en el catálogo' })
  crearCargo(@Body('nombre') nombre: string) {
    if (!nombre?.trim()) throw new HttpException('El nombre es requerido', HttpStatus.BAD_REQUEST);
    return this.nominaService.crearCargo(nombre.trim());
  }

  @Delete('cargos/:id')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Eliminar cargo (solo si no tiene empleados asignados)' })
  eliminarCargo(@Param('id', ParseIntPipe) id: number) {
    return this.nominaService.eliminarCargo(id);
  }

  // ── Empleados ──────────────────────────────────────────────────────────────

  @Post('empleados')
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Registrar nuevo empleado' })
  createEmpleado(@Body() dto: CreateEmpleadoDto) {
    return this.nominaService.createEmpleado(dto);
  }

  @Get('empleados')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Listar empleados con filtros (estado, departamento, búsqueda)' })
  getEmpleados(@Query() filtro: FiltroEmpleadoDto) {
    return this.nominaService.getEmpleados(filtro);
  }

  @Get('empleados/:id')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Detalle de empleado' })
  findEmpleado(@Param('id', ParseIntPipe) id: number) {
    return this.nominaService.findEmpleadoById(id);
  }

  @Get('empleados/:id/prestaciones')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Calcular prestaciones laborales: cesantía, preaviso, vacaciones' })
  getPrestaciones(@Param('id', ParseIntPipe) id: number) {
    return this.nominaService.getPrestaciones(id);
  }

  @Get('empleados/:id/historial')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Historial de nóminas del empleado' })
  getHistorial(@Param('id', ParseIntPipe) id: number) {
    return this.nominaService.getHistorialEmpleado(id);
  }

  @Patch('empleados/:id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Actualizar datos del empleado' })
  updateEmpleado(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateEmpleadoDto,
  ) {
    return this.nominaService.updateEmpleado(id, dto);
  }

  @Delete('empleados/:id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Desactivar empleado (soft delete)' })
  removeEmpleado(@Param('id', ParseIntPipe) id: number) {
    return this.nominaService.removeEmpleado(id);
  }

  @Patch('empleados/:id/vincular-usuario')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Vincular/desvincular usuario del sistema con empleado (habilita Portal del Empleado)' })
  vincularUsuario(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: VincularUsuarioDto,
  ) {
    return this.nominaService.vincularUsuario(id, dto.userId);
  }

  @Get('usuarios-tenant')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Listar usuarios activos del tenant (para dropdown de vinculación)' })
  getUsuariosTenant() {
    return this.nominaService.getUsuariosTenant();
  }

  @Post('empleados/:id/invitar')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Invitar empleado al Portal del Empleado — crea usuario rol:empleado y envía email de configuración' })
  invitarEmpleado(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: InvitarPortalDto,
  ) {
    return this.nominaService.invitarEmpleado(id, dto.email);
  }

  // ── Novedades ──────────────────────────────────────────────────────────────

  @Post('novedades')
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Registrar novedad (bono, horas extras, ausencia, descuento) para un empleado' })
  createNovedad(@Body() dto: CreateNovedadDto) {
    return this.nominaService.createNovedad(dto);
  }

  @Get('novedades')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Listar novedades. Filtrar por empleado, período o solo pendientes' })
  @ApiQuery({ name: 'empleadoId',     required: false })
  @ApiQuery({ name: 'periodoId',      required: false })
  @ApiQuery({ name: 'soloSinAplicar', required: false, type: Boolean })
  getNovedades(
    @Query('empleadoId')     empleadoId?: string,
    @Query('periodoId')      periodoId?:  string,
    @Query('soloSinAplicar') soloSin?:    string,
  ) {
    return this.nominaService.getNovedades(
      empleadoId ? Number(empleadoId) : undefined,
      periodoId  ? Number(periodoId)  : undefined,
      soloSin === 'true',
    );
  }

  @Delete('novedades/:id')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Eliminar novedad (solo si aún no fue aplicada)' })
  deleteNovedad(@Param('id', ParseIntPipe) id: number) {
    return this.nominaService.deleteNovedad(id);
  }

  // ── Contratos Laborales ────────────────────────────────────────────────────

  @Post('contratos')
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Crear contrato laboral para un empleado' })
  createContrato(@Body() dto: CreateContratoDto) {
    return this.nominaService.createContrato(dto);
  }

  @Get('contratos')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Listar contratos laborales. Filtrar por empleado' })
  @ApiQuery({ name: 'empleadoId', required: false })
  getContratos(@Query('empleadoId') empleadoId?: string) {
    return this.nominaService.getContratos(empleadoId ? Number(empleadoId) : undefined);
  }

  @Get('contratos/:id')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Detalle de contrato laboral' })
  findContrato(@Param('id', ParseIntPipe) id: number) {
    return this.nominaService.findContratoById(id);
  }

  @Patch('contratos/:id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Actualizar estado o cláusulas del contrato' })
  updateContrato(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateContratoDto,
  ) {
    return this.nominaService.updateContrato(id, dto);
  }

  @Get('contratos/:id/pdf')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Descargar contrato laboral en PDF (estructura legal Ley 16-92 RD)' })
  async getContratoPdf(
    @Param('id', ParseIntPipe) id: number,
    @Res() res: Response,
  ) {
    try {
      const { buffer, filename } = await this.nominaService.getContratoPdf(id);
      res.set({
        'Content-Type':        'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
      });
      res.send(buffer);
    } catch (err: any) {
      this.logger.error(
        `[ContratoPDF] Error en handler — contratoId:${id}`,
        err?.stack ?? err?.message ?? String(err),
      );
      if (res.headersSent) return;
      const status  = err instanceof HttpException ? err.getStatus() : 500;
      const message = err instanceof HttpException
        ? (err.getResponse() as any)?.message ?? err.message
        : (err?.message ?? 'Error al generar contrato PDF');
      res.status(status).json({ success: false, statusCode: status, message });
    }
  }

  @Patch('contratos/:id/firmar')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Marcar contrato como firmado (el físico fue firmado y archivado)' })
  marcarContratoFirmado(@Param('id', ParseIntPipe) id: number) {
    return this.nominaService.marcarContratoFirmado(id);
  }

  // ── Períodos de Nómina ─────────────────────────────────────────────────────

  @Post('periodos')
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Crear período de nómina — calcula automáticamente para todos los empleados activos (incluye novedades pendientes)' })
  crearPeriodo(@Body() dto: CreateNominaPeriodoDto, @GetUser() usuario: User) {
    return this.nominaService.crearPeriodo(dto, usuario.id);
  }

  @Get('periodos')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Listar períodos de nómina' })
  getPeriodos(@Query() filtro: FiltroNominaPeriodoDto) {
    return this.nominaService.getPeriodos(filtro);
  }

  @Get('periodos/:id')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Detalle del período con totales' })
  findPeriodo(@Param('id', ParseIntPipe) id: number) {
    return this.nominaService.findPeriodoById(id);
  }

  @Get('periodos/:id/lineas')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Desglose por empleado del período' })
  getLineas(@Param('id', ParseIntPipe) id: number) {
    return this.nominaService.getLineasPeriodo(id);
  }

  @Get('periodos/:periodoId/recibo/:empleadoId')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Recibo de sueldo individual (datos para imprimir)' })
  getRecibo(
    @Param('periodoId',  ParseIntPipe) periodoId:  number,
    @Param('empleadoId', ParseIntPipe) empleadoId: number,
  ) {
    return this.nominaService.getReciboEmpleado(periodoId, empleadoId);
  }

  @Get('periodos/:periodoId/recibo/:empleadoId/pdf')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Descargar Recibo de Sueldo en PDF (con novedades del período)' })
  async getReciboPdf(
    @Param('periodoId',  ParseIntPipe) periodoId:  number,
    @Param('empleadoId', ParseIntPipe) empleadoId: number,
    @Res() res: Response,
  ) {
    // Try-catch explícito: @Res() sin passthrough puede no propagar al ExceptionFilter global
    try {
      const data  = await this.nominaService.getReciboEmpleado(periodoId, empleadoId);
      const { buffer, filename } = await this.nominaService.generarReciboPdf(data);
      res.set({
        'Content-Type':        'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
      });
      res.send(buffer);
    } catch (err: any) {
      this.logger.error(
        `[ReciboPDF] Error en handler — periodoId:${periodoId}, empleadoId:${empleadoId}`,
        err?.stack ?? err?.message ?? String(err),
      );
      if (res.headersSent) return;
      const status  = err instanceof HttpException ? err.getStatus() : 500;
      const message = err instanceof HttpException
        ? (err.getResponse() as any)?.message ?? err.message
        : (err?.message ?? 'Error al generar recibo PDF');
      res.status(status).json({ success: false, statusCode: status, message });
    }
  }

  @Get('periodos/:id/archivo-banco')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Generar archivo CSV de banco para pago electrónico de nómina (ACH)' })
  async getArchivoBanco(
    @Param('id', ParseIntPipe) id: number,
    @Res() res: Response,
  ) {
    const { csv, filename, totalLineas } = await this.nominaService.generarArchivoBanco(id);
    res.set({
      'Content-Type':        'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'X-Total-Lineas':      String(totalLineas),
    });
    res.send('﻿' + csv); // BOM para que Excel lo abra correctamente
  }

  @Patch('periodos/:id/procesar')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Procesar nómina (BORRADOR → PROCESADA, bloquea edición)' })
  procesarPeriodo(@Param('id', ParseIntPipe) id: number) {
    return this.nominaService.procesarPeriodo(id);
  }

  @Patch('periodos/:id/pagar')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Marcar nómina como pagada y generar asiento contable' })
  pagarPeriodo(@Param('id', ParseIntPipe) id: number, @GetUser() usuario: User) {
    return this.nominaService.pagarPeriodo(id, usuario.id);
  }

  @Patch('periodos/:id/anular')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Anular período de nómina (solo ADMIN, no aplica a pagadas)' })
  anularPeriodo(@Param('id', ParseIntPipe) id: number) {
    return this.nominaService.anularPeriodo(id);
  }

  // ── Préstamos ──────────────────────────────────────────────────────────────

  @Post('prestamos')
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Registrar préstamo a empleado' })
  createPrestamo(@Body() dto: CreatePrestamoDto) {
    return this.nominaService.createPrestamo(dto);
  }

  @Get('prestamos')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Listar préstamos. Filtrar por empleado (?empleadoId=)' })
  @ApiQuery({ name: 'empleadoId', required: false })
  getPrestamos(@Query('empleadoId') empleadoId?: string) {
    return this.nominaService.getPrestamos(empleadoId ? Number(empleadoId) : undefined);
  }

  @Patch('prestamos/:id/cuota')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Registrar pago de una cuota del préstamo' })
  registrarCuotaPrestamo(@Param('id', ParseIntPipe) id: number) {
    return this.nominaService.registrarCuotaPrestamo(id);
  }

  @Patch('prestamos/:id/anular')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Anular préstamo activo' })
  anularPrestamo(@Param('id', ParseIntPipe) id: number) {
    return this.nominaService.anularPrestamo(id);
  }

  // ── Anticipos ──────────────────────────────────────────────────────────────

  @Post('anticipos')
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Registrar anticipo de nómina a empleado' })
  createAnticipo(@Body() dto: CreateAnticipoDto) {
    return this.nominaService.createAnticipo(dto);
  }

  @Get('anticipos')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Listar anticipos. Filtrar por empleado (?empleadoId=)' })
  @ApiQuery({ name: 'empleadoId', required: false })
  getAnticipos(@Query('empleadoId') empleadoId?: string) {
    return this.nominaService.getAnticipos(empleadoId ? Number(empleadoId) : undefined);
  }

  @Patch('anticipos/:id/anular')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Anular anticipo pendiente' })
  anularAnticipo(@Param('id', ParseIntPipe) id: number) {
    return this.nominaService.anularAnticipo(id);
  }
}
