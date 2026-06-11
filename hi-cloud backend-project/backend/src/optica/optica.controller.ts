import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query,
  ParseIntPipe, UseGuards, Logger, Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiHeader } from '@nestjs/swagger';
import {
  IsString, IsOptional, IsInt, IsPositive, IsNumber, Min,
  IsDateString, IsBoolean,
} from 'class-validator';
import { Type } from 'class-transformer';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../tenant/tenant.guard';
import { ModuloAddonGuard } from '../modulos-addon/guards/modulo-addon.guard';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { User } from '../users/users.entity';
import { OpticaService } from './optica.service';
import { RecetaPdfService } from './receta-pdf.service';

// ── DTOs ─────────────────────────────────────────────────────────────────────

class CreatePacienteDto {
  @IsString()             nombre!: string;
  @IsString()             apellido!: string;
  @IsOptional() @IsString() cedula?: string;
  @IsOptional() @IsDateString() fechaNacimiento?: string;
  @IsOptional() @IsString() genero?: string;
  @IsOptional() @IsString() telefono?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() direccion?: string;
  @IsOptional() @IsString() ocupacion?: string;
  @IsOptional() @IsString() notas?: string;
}

class UpdatePacienteDto {
  @IsOptional() @IsString() nombre?: string;
  @IsOptional() @IsString() apellido?: string;
  @IsOptional() @IsString() cedula?: string;
  @IsOptional() @IsDateString() fechaNacimiento?: string;
  @IsOptional() @IsString() genero?: string;
  @IsOptional() @IsString() telefono?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() direccion?: string;
  @IsOptional() @IsString() ocupacion?: string;
  @IsOptional() @IsString() notas?: string;
}

class CreateMedicoDto {
  @IsString()             nombre!: string;
  @IsString()             apellido!: string;
  @IsOptional() @IsString() especialidad?: string;
  @IsOptional() @IsString() exequatur?: string;
  @IsOptional() @IsString() telefono?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() direccion?: string;
  @IsOptional() @IsString() notas?: string;
}
class UpdateMedicoDto extends CreateMedicoDto {}

class CreateCitaDto {
  @IsInt() @IsPositive() @Type(() => Number) pacienteId!: number;
  @IsOptional() @IsInt() @Type(() => Number) medicoId?: number;
  @IsDateString()                             fechaHora!: string;
  @IsOptional() @IsInt() @Min(5) @Type(() => Number) duracionMinutos?: number;
  @IsOptional() @IsString() tipo?: string;
  @IsOptional() @IsString() motivoConsulta?: string;
  @IsOptional() @IsString() notas?: string;
}
class UpdateCitaDto {
  @IsOptional() @IsInt() @Type(() => Number) medicoId?: number;
  @IsOptional() @IsDateString()               fechaHora?: string;
  @IsOptional() @IsInt() @Min(5) @Type(() => Number) duracionMinutos?: number;
  @IsOptional() @IsString() tipo?: string;
  @IsOptional() @IsString() estado?: string;
  @IsOptional() @IsString() motivoConsulta?: string;
  @IsOptional() @IsString() notas?: string;
}

class CreateConsultaDto {
  @IsInt() @IsPositive() @Type(() => Number) pacienteId!: number;
  @IsOptional() @IsInt() @Type(() => Number) medicoId?: number;
  @IsOptional() @IsInt() @Type(() => Number) citaId?: number;
  @IsDateString()                             fecha!: string;
  @IsOptional() @IsString() motivoConsulta?: string;
  @IsOptional() @IsString() agudezaVisualOD?: string;
  @IsOptional() @IsString() agudezaVisualOI?: string;
  @IsOptional() @IsNumber() @Type(() => Number) presionOcularOD?: number;
  @IsOptional() @IsNumber() @Type(() => Number) presionOcularOI?: number;
  @IsOptional() @IsString() hallazgos?: string;
  @IsOptional() @IsString() diagnostico?: string;
  @IsOptional() @IsString() tratamiento?: string;
  @IsOptional() @IsDateString() proximaCita?: string;
  @IsOptional() @IsString() notas?: string;
}
class UpdateConsultaDto {
  @IsOptional() @IsInt() @Type(() => Number) medicoId?: number;
  @IsOptional() @IsDateString()               fecha?: string;
  @IsOptional() @IsString() motivoConsulta?: string;
  @IsOptional() @IsString() agudezaVisualOD?: string;
  @IsOptional() @IsString() agudezaVisualOI?: string;
  @IsOptional() @IsNumber() @Type(() => Number) presionOcularOD?: number;
  @IsOptional() @IsNumber() @Type(() => Number) presionOcularOI?: number;
  @IsOptional() @IsString() hallazgos?: string;
  @IsOptional() @IsString() diagnostico?: string;
  @IsOptional() @IsString() tratamiento?: string;
  @IsOptional() @IsDateString() proximaCita?: string;
  @IsOptional() @IsString() notas?: string;
}

class CreateRecetaDto {
  @IsInt() @IsPositive() @Type(() => Number) pacienteId!: number;
  @IsOptional() @IsInt() @Type(() => Number) medicoId?: number;
  @IsOptional() @IsInt() @Type(() => Number) consultaId?: number;
  @IsDateString()                             fecha!: string;
  @IsOptional() @IsString() tipo?: string;
  @IsOptional() @IsNumber() @Type(() => Number) esferaOD?: number;
  @IsOptional() @IsNumber() @Type(() => Number) cilindroOD?: number;
  @IsOptional() @IsNumber() @Type(() => Number) ejeOD?: number;
  @IsOptional() @IsNumber() @Type(() => Number) adicionOD?: number;
  @IsOptional() @IsNumber() @Type(() => Number) esferaOI?: number;
  @IsOptional() @IsNumber() @Type(() => Number) cilindroOI?: number;
  @IsOptional() @IsNumber() @Type(() => Number) ejeOI?: number;
  @IsOptional() @IsNumber() @Type(() => Number) adicionOI?: number;
  @IsOptional() @IsNumber() @Type(() => Number) dipLejos?: number;
  @IsOptional() @IsNumber() @Type(() => Number) dipCerca?: number;
  @IsOptional() @IsString() marcaContacto?: string;
  @IsOptional() @IsString() tipoContacto?: string;
  @IsOptional() @IsString() instrucciones?: string;
  @IsOptional() @IsInt() @Min(1) @Type(() => Number) vigenciaAnos?: number;
  @IsOptional() @IsString() notas?: string;
}
class UpdateRecetaDto {
  @IsOptional() @IsInt() @Type(() => Number) medicoId?: number;
  @IsOptional() @IsDateString()               fecha?: string;
  @IsOptional() @IsString() tipo?: string;
  @IsOptional() @IsNumber() @Type(() => Number) esferaOD?: number;
  @IsOptional() @IsNumber() @Type(() => Number) cilindroOD?: number;
  @IsOptional() @IsNumber() @Type(() => Number) ejeOD?: number;
  @IsOptional() @IsNumber() @Type(() => Number) adicionOD?: number;
  @IsOptional() @IsNumber() @Type(() => Number) esferaOI?: number;
  @IsOptional() @IsNumber() @Type(() => Number) cilindroOI?: number;
  @IsOptional() @IsNumber() @Type(() => Number) ejeOI?: number;
  @IsOptional() @IsNumber() @Type(() => Number) adicionOI?: number;
  @IsOptional() @IsNumber() @Type(() => Number) dipLejos?: number;
  @IsOptional() @IsNumber() @Type(() => Number) dipCerca?: number;
  @IsOptional() @IsString() marcaContacto?: string;
  @IsOptional() @IsString() tipoContacto?: string;
  @IsOptional() @IsString() instrucciones?: string;
  @IsOptional() @IsInt() @Min(1) @Type(() => Number) vigenciaAnos?: number;
  @IsOptional() @IsString() notas?: string;
}

class CreateOrdenTrabajoDto {
  @IsInt() @IsPositive() @Type(() => Number) pacienteId!: number;
  @IsOptional() @IsInt() @Type(() => Number) recetaId?: number;
  @IsDateString()                             fecha!: string;
  @IsOptional() @IsString() tipoLente?: string;
  @IsOptional() @IsString() materialLente?: string;
  @IsOptional() @IsString() tratamientoLente?: string;
  @IsOptional() @IsString() colorMontura?: string;
  @IsOptional() @IsString() marcaMontura?: string;
  @IsOptional() @IsString() modeloMontura?: string;
  @IsOptional() @IsNumber() @Min(0) @Type(() => Number) subtotal?: number;
  @IsOptional() @IsNumber() @Min(0) @Type(() => Number) itbis?: number;
  @IsOptional() @IsNumber() @Min(0) @Type(() => Number) total?: number;
  @IsOptional() @IsNumber() @Min(0) @Type(() => Number) abono?: number;
  @IsOptional() @IsString() notas?: string;
  @IsOptional() @IsDateString() fechaEntrega?: string;
}
class UpdateOrdenTrabajoDto {
  @IsOptional() @IsString() estado?: string;
  @IsOptional() @IsString() tipoLente?: string;
  @IsOptional() @IsString() materialLente?: string;
  @IsOptional() @IsString() tratamientoLente?: string;
  @IsOptional() @IsString() colorMontura?: string;
  @IsOptional() @IsString() marcaMontura?: string;
  @IsOptional() @IsString() modeloMontura?: string;
  @IsOptional() @IsNumber() @Min(0) @Type(() => Number) subtotal?: number;
  @IsOptional() @IsNumber() @Min(0) @Type(() => Number) itbis?: number;
  @IsOptional() @IsNumber() @Min(0) @Type(() => Number) total?: number;
  @IsOptional() @IsNumber() @Min(0) @Type(() => Number) abono?: number;
  @IsOptional() @IsNumber() @Min(0) @Type(() => Number) balance?: number;
  @IsOptional() @IsInt() @Type(() => Number) facturaId?: number;
  @IsOptional() @IsString() notas?: string;
  @IsOptional() @IsDateString() fechaEntrega?: string;
}

class CreateReclamacionArsDto {
  @IsInt() @IsPositive() @Type(() => Number) pacienteId!: number;
  @IsString()                                arsNombre!: string;
  @IsOptional() @IsString()                  arsNumeroAfiliado?: string;
  @IsOptional() @IsString()                  arsNumeroAutorizacion?: string;
  @IsOptional() @IsInt() @Type(() => Number) consultaId?: number;
  @IsOptional() @IsInt() @Type(() => Number) recetaId?: number;
  @IsOptional() @IsInt() @Type(() => Number) ordenTrabajoId?: number;
  @IsDateString()                             fecha!: string;
  @IsOptional() @IsNumber() @Min(0) @Type(() => Number) montoReclamado?: number;
  @IsOptional() @IsNumber() @Min(0) @Type(() => Number) montoCubierto?: number;
  @IsOptional() @IsNumber() @Min(0) @Type(() => Number) montoPaciente?: number;
  @IsOptional() @IsString() observaciones?: string;
}
class FacturarOtDto {
  @IsInt() @IsPositive() @Type(() => Number) clienteId!: number;
  @IsOptional() @IsString() tipoNcf?: string;
}

class CreateInventarioDto {
  @IsOptional() @IsString() tipo?: string;
  @IsOptional() @IsString() codigo?: string;
  @IsOptional() @IsString() marca?: string;
  @IsOptional() @IsString() modelo?: string;
  @IsOptional() @IsString() color?: string;
  @IsOptional() @IsString() material?: string;
  @IsOptional() @IsString() genero?: string;
  @IsOptional() @IsNumber() @Min(0) @Type(() => Number) precio?: number;
  @IsOptional() @IsNumber() @Min(0) @Type(() => Number) costo?: number;
  @IsOptional() @IsInt() @Min(0) @Type(() => Number) stockActual?: number;
  @IsOptional() @IsInt() @Min(0) @Type(() => Number) stockMinimo?: number;
  @IsOptional() @IsString() descripcion?: string;
}
class UpdateInventarioDto extends CreateInventarioDto {
  @IsOptional() @IsBoolean() activo?: boolean;
}
class AjustarStockDto {
  @IsInt() @Type(() => Number) delta!: number;
  @IsOptional() @IsString() motivo?: string;
}

class UpdateReclamacionArsDto {
  @IsOptional() @IsString()  arsNumeroAfiliado?: string;
  @IsOptional() @IsString()  arsNumeroAutorizacion?: string;
  @IsOptional() @IsInt() @Type(() => Number) consultaId?: number;
  @IsOptional() @IsInt() @Type(() => Number) recetaId?: number;
  @IsOptional() @IsInt() @Type(() => Number) ordenTrabajoId?: number;
  @IsOptional() @IsDateString() fecha?: string;
  @IsOptional() @IsString() estado?: string;
  @IsOptional() @IsNumber() @Min(0) @Type(() => Number) montoReclamado?: number;
  @IsOptional() @IsNumber() @Min(0) @Type(() => Number) montoCubierto?: number;
  @IsOptional() @IsNumber() @Min(0) @Type(() => Number) montoPaciente?: number;
  @IsOptional() @IsString() motivoRechazo?: string;
  @IsOptional() @IsString() observaciones?: string;
}

// ── Controller ────────────────────────────────────────────────────────────────

const OPTICA_GUARDS = [JwtAuthGuard, TenantGuard, ModuloAddonGuard('optica')];

@ApiTags('Óptica')
@ApiBearerAuth('access-token')
@ApiHeader({ name: 'X-Empresa-ID', description: 'ID de la empresa activa', required: true })
@UseGuards(...OPTICA_GUARDS)
@Controller('optica')
export class OpticaController {
  private readonly logger = new Logger(OpticaController.name);

  constructor(
    private readonly svc: OpticaService,
    private readonly recetaPdf: RecetaPdfService,
  ) {}

  // ── Dashboard ──────────────────────────────────────────────────────────────

  @Get('dashboard')
  @ApiOperation({ summary: 'Resumen y métricas del módulo óptica' })
  getDashboard() { return this.svc.getDashboard(); }

  @Get('estadisticas')
  @ApiOperation({ summary: 'Estadísticas históricas: citas, ingresos, pacientes, diagnósticos' })
  getEstadisticas() { return this.svc.getEstadisticas(); }

  // ── Pacientes ──────────────────────────────────────────────────────────────

  @Get('pacientes')
  @ApiOperation({ summary: 'Listar pacientes' })
  listarPacientes(
    @Query('page', new ParseIntPipe({ optional: true })) page?: number,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
    @Query('search') search?: string,
  ) { return this.svc.listarPacientes(page, limit, search); }

  @Post('pacientes')
  @ApiOperation({ summary: 'Crear paciente' })
  crearPaciente(@Body() dto: CreatePacienteDto) { return this.svc.crearPaciente(dto); }

  @Get('pacientes/:id/historial')
  @ApiOperation({ summary: 'Historial completo de un paciente' })
  getHistorialPaciente(@Param('id', ParseIntPipe) id: number) { return this.svc.getHistorialPaciente(id); }

  @Get('pacientes/:id')
  @ApiOperation({ summary: 'Obtener paciente' })
  obtenerPaciente(@Param('id', ParseIntPipe) id: number) { return this.svc.obtenerPaciente(id); }

  @Patch('pacientes/:id')
  @ApiOperation({ summary: 'Actualizar paciente' })
  actualizarPaciente(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdatePacienteDto) {
    return this.svc.actualizarPaciente(id, dto);
  }

  @Delete('pacientes/:id')
  @ApiOperation({ summary: 'Eliminar paciente (soft delete)' })
  eliminarPaciente(@Param('id', ParseIntPipe) id: number) { return this.svc.eliminarPaciente(id); }

  // ── Médicos ────────────────────────────────────────────────────────────────

  @Get('medicos')
  @ApiOperation({ summary: 'Listar médicos/optometristas' })
  listarMedicos() { return this.svc.listarMedicos(); }

  @Post('medicos')
  @ApiOperation({ summary: 'Crear médico' })
  crearMedico(@Body() dto: CreateMedicoDto) { return this.svc.crearMedico(dto); }

  @Get('medicos/:id')
  @ApiOperation({ summary: 'Obtener médico' })
  obtenerMedico(@Param('id', ParseIntPipe) id: number) { return this.svc.obtenerMedico(id); }

  @Patch('medicos/:id')
  @ApiOperation({ summary: 'Actualizar médico' })
  actualizarMedico(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateMedicoDto) {
    return this.svc.actualizarMedico(id, dto);
  }

  @Delete('medicos/:id')
  @ApiOperation({ summary: 'Eliminar médico (soft delete)' })
  eliminarMedico(@Param('id', ParseIntPipe) id: number) { return this.svc.eliminarMedico(id); }

  // ── Citas ──────────────────────────────────────────────────────────────────

  @Get('citas')
  @ApiOperation({ summary: 'Listar citas' })
  listarCitas(
    @Query('page', new ParseIntPipe({ optional: true })) page?: number,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
    @Query('estado') estado?: string,
    @Query('medicoId', new ParseIntPipe({ optional: true })) medicoId?: number,
    @Query('pacienteId', new ParseIntPipe({ optional: true })) pacienteId?: number,
    @Query('fecha') fecha?: string,
  ) { return this.svc.listarCitas(page, limit, estado, medicoId, pacienteId, fecha); }

  @Post('citas')
  @ApiOperation({ summary: 'Crear cita' })
  crearCita(@Body() dto: CreateCitaDto, @GetUser() user: User) {
    return this.svc.crearCita(dto, user.id);
  }

  @Get('citas/:id')
  @ApiOperation({ summary: 'Obtener cita' })
  obtenerCita(@Param('id', ParseIntPipe) id: number) { return this.svc.obtenerCita(id); }

  @Patch('citas/:id')
  @ApiOperation({ summary: 'Actualizar cita' })
  actualizarCita(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateCitaDto) {
    return this.svc.actualizarCita(id, dto);
  }

  // ── Consultas ──────────────────────────────────────────────────────────────

  @Get('consultas')
  @ApiOperation({ summary: 'Listar consultas' })
  listarConsultas(
    @Query('page', new ParseIntPipe({ optional: true })) page?: number,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
    @Query('pacienteId', new ParseIntPipe({ optional: true })) pacienteId?: number,
  ) { return this.svc.listarConsultas(page, limit, pacienteId); }

  @Post('consultas')
  @ApiOperation({ summary: 'Crear consulta' })
  crearConsulta(@Body() dto: CreateConsultaDto) { return this.svc.crearConsulta(dto); }

  @Get('consultas/:id')
  @ApiOperation({ summary: 'Obtener consulta' })
  obtenerConsulta(@Param('id', ParseIntPipe) id: number) { return this.svc.obtenerConsulta(id); }

  @Patch('consultas/:id')
  @ApiOperation({ summary: 'Actualizar consulta' })
  actualizarConsulta(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateConsultaDto) {
    return this.svc.actualizarConsulta(id, dto);
  }

  // ── Recetas ────────────────────────────────────────────────────────────────

  @Get('recetas')
  @ApiOperation({ summary: 'Listar recetas ópticas' })
  listarRecetas(
    @Query('page', new ParseIntPipe({ optional: true })) page?: number,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
    @Query('pacienteId', new ParseIntPipe({ optional: true })) pacienteId?: number,
  ) { return this.svc.listarRecetas(page, limit, pacienteId); }

  @Post('recetas')
  @ApiOperation({ summary: 'Crear receta óptica' })
  crearReceta(@Body() dto: CreateRecetaDto) { return this.svc.crearReceta(dto); }

  @Get('recetas/:id')
  @ApiOperation({ summary: 'Obtener receta óptica' })
  obtenerReceta(@Param('id', ParseIntPipe) id: number) { return this.svc.obtenerReceta(id); }

  @Patch('recetas/:id')
  @ApiOperation({ summary: 'Actualizar receta óptica' })
  actualizarReceta(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateRecetaDto) {
    return this.svc.actualizarReceta(id, dto);
  }

  @Get('recetas/:id/pdf')
  @ApiOperation({ summary: 'Generar PDF de receta óptica' })
  async getPdfReceta(@Param('id', ParseIntPipe) id: number, @Res() res: Response) {
    const pdf = await this.recetaPdf.generarPdfReceta(id);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="receta-optica-${id}.pdf"`,
      'Content-Length': String(pdf.length),
    });
    res.end(pdf);
  }

  // ── Órdenes de Trabajo ─────────────────────────────────────────────────────

  @Get('ordenes-trabajo')
  @ApiOperation({ summary: 'Listar órdenes de trabajo' })
  listarOrdenesTrabajo(
    @Query('page', new ParseIntPipe({ optional: true })) page?: number,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
    @Query('estado') estado?: string,
    @Query('pacienteId', new ParseIntPipe({ optional: true })) pacienteId?: number,
  ) { return this.svc.listarOrdenesTrabajo(page, limit, estado, pacienteId); }

  @Post('ordenes-trabajo')
  @ApiOperation({ summary: 'Crear orden de trabajo' })
  crearOrdenTrabajo(@Body() dto: CreateOrdenTrabajoDto, @GetUser() user: User) {
    return this.svc.crearOrdenTrabajo(dto, user.id);
  }

  @Post('ordenes-trabajo/:id/facturar')
  @ApiOperation({ summary: 'Generar pre-factura ERP desde una orden de trabajo' })
  facturarOrdenTrabajo(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: FacturarOtDto,
    @GetUser() user: User,
  ) { return this.svc.facturarOrdenTrabajo(id, dto.clienteId, user.id, dto.tipoNcf); }

  @Get('ordenes-trabajo/:id')
  @ApiOperation({ summary: 'Obtener orden de trabajo' })
  obtenerOrdenTrabajo(@Param('id', ParseIntPipe) id: number) { return this.svc.obtenerOrdenTrabajo(id); }

  @Patch('ordenes-trabajo/:id')
  @ApiOperation({ summary: 'Actualizar orden de trabajo' })
  actualizarOrdenTrabajo(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateOrdenTrabajoDto) {
    return this.svc.actualizarOrdenTrabajo(id, dto);
  }

  // ── Reclamaciones ARS ──────────────────────────────────────────────────────

  @Get('reclamaciones-ars')
  @ApiOperation({ summary: 'Listar reclamaciones ARS' })
  listarReclamacionesArs(
    @Query('page', new ParseIntPipe({ optional: true })) page?: number,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
    @Query('estado') estado?: string,
  ) { return this.svc.listarReclamacionesArs(page, limit, estado); }

  @Get('reclamaciones-ars/reporte')
  @ApiOperation({ summary: 'Reporte de reclamaciones ARS (resumen + detalle)' })
  getReporteArs(
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
    @Query('arsNombre') arsNombre?: string,
  ) { return this.svc.getReporteArs(desde, hasta, arsNombre); }

  @Post('reclamaciones-ars')
  @ApiOperation({ summary: 'Crear reclamación ARS' })
  crearReclamacionArs(@Body() dto: CreateReclamacionArsDto) { return this.svc.crearReclamacionArs(dto); }

  @Get('reclamaciones-ars/:id')
  @ApiOperation({ summary: 'Obtener reclamación ARS' })
  obtenerReclamacionArs(@Param('id', ParseIntPipe) id: number) { return this.svc.obtenerReclamacionArs(id); }

  @Patch('reclamaciones-ars/:id')
  @ApiOperation({ summary: 'Actualizar reclamación ARS' })
  actualizarReclamacionArs(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateReclamacionArsDto) {
    return this.svc.actualizarReclamacionArs(id, dto);
  }

  // ── Inventario ─────────────────────────────────────────────────────────────

  @Get('inventario/resumen')
  @ApiOperation({ summary: 'Resumen de inventario óptico por tipo' })
  resumenInventario() { return this.svc.resumenInventario(); }

  @Get('inventario')
  @ApiOperation({ summary: 'Listar inventario óptico' })
  listarInventario(
    @Query('page', new ParseIntPipe({ optional: true })) page?: number,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
    @Query('tipo') tipo?: string,
    @Query('search') search?: string,
  ) { return this.svc.listarInventario(page, limit, tipo, search); }

  @Post('inventario')
  @ApiOperation({ summary: 'Crear ítem de inventario' })
  crearInventario(@Body() dto: CreateInventarioDto) { return this.svc.crearInventario(dto); }

  @Patch('inventario/:id')
  @ApiOperation({ summary: 'Actualizar ítem de inventario' })
  actualizarInventario(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateInventarioDto) {
    return this.svc.actualizarInventario(id, dto);
  }

  @Post('inventario/:id/ajustar-stock')
  @ApiOperation({ summary: 'Ajustar stock de un ítem (+/-)' })
  ajustarStock(@Param('id', ParseIntPipe) id: number, @Body() dto: AjustarStockDto) {
    return this.svc.ajustarStock(id, dto.delta, dto.motivo);
  }

  @Delete('inventario/:id')
  @ApiOperation({ summary: 'Dar de baja ítem de inventario (soft delete)' })
  eliminarInventario(@Param('id', ParseIntPipe) id: number) { return this.svc.eliminarInventario(id); }
}
