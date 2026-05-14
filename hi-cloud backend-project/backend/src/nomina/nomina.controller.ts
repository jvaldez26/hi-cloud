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
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { IsString, IsOptional, IsEnum, IsNumber, IsInt, IsPositive, Min, IsBoolean } from 'class-validator';
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

@ApiTags('Nómina y Recursos Humanos')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@UseGuards(PlanGuard)
@RequiereModulo('nomina')
@Controller('nomina')
export class NominaController {
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
    const data  = await this.nominaService.getReciboEmpleado(periodoId, empleadoId);
    const { buffer, filename } = await this.nominaService.generarReciboPdf(data);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${filename}"` });
    res.send(buffer);
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
}
