import {
  Controller, Get, Post, Patch, Param, Body, Query, ParseIntPipe,
  UseGuards, Request,
  Res, StreamableFile,
} from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../tenant/tenant.guard';
import { ModuloAddonGuard } from '../modulos-addon/guards/modulo-addon.guard';
import {
  IsString, IsOptional, IsNumber, IsBoolean, IsDateString, IsEmail,
  IsArray, ValidateNested, IsInt, Min,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ClinicaService } from './clinica.service';
import { ClinicaPdfService } from './clinica-pdf.service';

// ── DTOs ──────────────────────────────────────────────────────────────────────

class CreatePacienteDto {
  @IsOptional() @IsString() cedula?: string;
  @IsString() nombre!: string;
  @IsOptional() @IsString() apellidos?: string;
  @IsOptional() @IsString() fechaNacimiento?: string;
  @IsOptional() @IsString() sexo?: string;
  @IsOptional() @IsString() estadoCivil?: string;
  @IsOptional() @IsString() telefono?: string;
  @IsOptional() @IsString() telefonoEmergencia?: string;
  @IsOptional() @IsString() contactoEmergencia?: string;
  @IsOptional() @IsEmail() @IsOptional() email?: string;
  @IsOptional() @IsString() direccion?: string;
  @IsOptional() @IsString() arsNombre?: string;
  @IsOptional() @IsString() arsNumeroAfiliado?: string;
  @IsOptional() @IsString() arsTipo?: string;
  @IsOptional() @IsString() arsPlan?: string;
  @IsOptional() @IsString() grupoSanguineo?: string;
  @IsOptional() @IsString() alergias?: string;
  @IsOptional() @IsString() antecedentesFamiliares?: string;
  @IsOptional() @IsString() antecedentesPersonales?: string;
  @IsOptional() @IsString() medicamentosActuales?: string;
  @IsOptional() @IsNumber() @Type(() => Number) clienteId?: number;
}

class UpdatePacienteDto {
  @IsOptional() @IsString() cedula?: string;
  @IsOptional() @IsString() nombre?: string;
  @IsOptional() @IsString() apellidos?: string;
  @IsOptional() @IsString() fechaNacimiento?: string;
  @IsOptional() @IsString() sexo?: string;
  @IsOptional() @IsString() estadoCivil?: string;
  @IsOptional() @IsString() telefono?: string;
  @IsOptional() @IsString() telefonoEmergencia?: string;
  @IsOptional() @IsString() contactoEmergencia?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() direccion?: string;
  @IsOptional() @IsString() arsNombre?: string;
  @IsOptional() @IsString() arsNumeroAfiliado?: string;
  @IsOptional() @IsString() arsTipo?: string;
  @IsOptional() @IsString() arsPlan?: string;
  @IsOptional() @IsString() grupoSanguineo?: string;
  @IsOptional() @IsString() alergias?: string;
  @IsOptional() @IsString() antecedentesFamiliares?: string;
  @IsOptional() @IsString() antecedentesPersonales?: string;
  @IsOptional() @IsString() medicamentosActuales?: string;
  @IsOptional() @IsNumber() @Type(() => Number) clienteId?: number;
  @IsOptional() @IsBoolean() @Transform(({ value }) => value === 'true' || value === true) isActive?: boolean;
}

class CreateMedicoDto {
  @IsString() nombre!: string;
  @IsOptional() @IsString() apellidos?: string;
  @IsOptional() @IsString() especialidad?: string;
  @IsOptional() @IsString() subespecialidad?: string;
  @IsOptional() @IsString() exequatur?: string;
  @IsOptional() @IsString() colegiatura?: string;
  @IsOptional() @IsString() telefono?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() firma?: string;
  @IsOptional() @IsString() selloUrl?: string;
  @IsOptional() @IsNumber() @Type(() => Number) tarifaConsulta?: number;
  @IsOptional() @IsNumber() @Type(() => Number) empleadoId?: number;
  @IsOptional() @IsString() horarioLunes?: string;
  @IsOptional() @IsString() horarioMartes?: string;
  @IsOptional() @IsString() horarioMiercoles?: string;
  @IsOptional() @IsString() horarioJueves?: string;
  @IsOptional() @IsString() horarioViernes?: string;
  @IsOptional() @IsString() horarioSabado?: string;
  @IsOptional() @IsString() horarioDomingo?: string;
}

class UpdateMedicoDto {
  @IsOptional() @IsString() nombre?: string;
  @IsOptional() @IsString() apellidos?: string;
  @IsOptional() @IsString() especialidad?: string;
  @IsOptional() @IsString() subespecialidad?: string;
  @IsOptional() @IsString() exequatur?: string;
  @IsOptional() @IsString() colegiatura?: string;
  @IsOptional() @IsString() telefono?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() firma?: string;
  @IsOptional() @IsString() selloUrl?: string;
  @IsOptional() @IsNumber() @Type(() => Number) tarifaConsulta?: number;
  @IsOptional() @IsNumber() @Type(() => Number) empleadoId?: number;
  @IsOptional() @IsBoolean() @Transform(({ value }) => value === 'true' || value === true) isActive?: boolean;
  @IsOptional() @IsString() horarioLunes?: string;
  @IsOptional() @IsString() horarioMartes?: string;
  @IsOptional() @IsString() horarioMiercoles?: string;
  @IsOptional() @IsString() horarioJueves?: string;
  @IsOptional() @IsString() horarioViernes?: string;
  @IsOptional() @IsString() horarioSabado?: string;
  @IsOptional() @IsString() horarioDomingo?: string;
}

class CreateCitaDto {
  @IsNumber() @Type(() => Number) pacienteId!: number;
  @IsNumber() @Type(() => Number) medicoId!: number;
  @IsString() fecha!: string;
  @IsString() hora!: string;
  @IsOptional() @IsNumber() @Type(() => Number) duracionMinutos?: number;
  @IsOptional() @IsString() tipoCita?: string;
  @IsOptional() @IsString() motivo?: string;
  @IsOptional() @IsString() estado?: string;
  @IsOptional() @IsString() sala?: string;
  @IsOptional() @IsString() prioridad?: string;
  @IsOptional() @IsString() notas?: string;
}

class UpdateCitaDto {
  @IsOptional() @IsNumber() @Type(() => Number) pacienteId?: number;
  @IsOptional() @IsNumber() @Type(() => Number) medicoId?: number;
  @IsOptional() @IsString() fecha?: string;
  @IsOptional() @IsString() hora?: string;
  @IsOptional() @IsNumber() @Type(() => Number) duracionMinutos?: number;
  @IsOptional() @IsString() tipoCita?: string;
  @IsOptional() @IsString() motivo?: string;
  @IsOptional() @IsString() estado?: string;
  @IsOptional() @IsString() sala?: string;
  @IsOptional() @IsString() prioridad?: string;
  @IsOptional() @IsString() notas?: string;
}

class CambiarEstadoCitaDto {
  @IsString() estado!: string;
}

class RegistrarLlegadaDto {
  @IsNumber() @Type(() => Number) citaId!: number;
  @IsNumber() @Type(() => Number) pacienteId!: number;
  @IsOptional() @IsString() notas?: string;
}

class CreateConsultaDto {
  @IsNumber() @Type(() => Number) pacienteId!: number;
  @IsNumber() @Type(() => Number) medicoId!: number;
  @IsOptional() @IsNumber() @Type(() => Number) citaId?: number;
  @IsOptional() @IsString() tipoCita?: string;
  @IsString() motivoConsulta!: string;
  @IsOptional() @IsString() enfermedadActual?: string;
  @IsOptional() @IsNumber() @Type(() => Number) temperatura?: number;
  @IsOptional() @IsNumber() @Type(() => Number) presionSistolica?: number;
  @IsOptional() @IsNumber() @Type(() => Number) presionDiastolica?: number;
  @IsOptional() @IsNumber() @Type(() => Number) frecuenciaCardiaca?: number;
  @IsOptional() @IsNumber() @Type(() => Number) frecuenciaRespiratoria?: number;
  @IsOptional() @IsNumber() @Type(() => Number) saturacionOxigeno?: number;
  @IsOptional() @IsNumber() @Type(() => Number) peso?: number;
  @IsOptional() @IsNumber() @Type(() => Number) talla?: number;
  @IsOptional() @IsString() examenFisico?: string;
  @IsOptional() @IsString() diagnosticoPrincipal?: string;
  @IsOptional() @IsString() diagnosticosCIE10?: string;
  @IsOptional() @IsString() diagnosticosDescripcion?: string;
  @IsOptional() @IsString() planTratamiento?: string;
  @IsOptional() @IsString() indicaciones?: string;
  @IsOptional() @IsString() proximaCita?: string;
  @IsOptional() @IsString() proximaCitaMotivo?: string;
}

class UpdateConsultaDto {
  @IsOptional() @IsString() motivoConsulta?: string;
  @IsOptional() @IsString() enfermedadActual?: string;
  @IsOptional() @IsNumber() @Type(() => Number) temperatura?: number;
  @IsOptional() @IsNumber() @Type(() => Number) presionSistolica?: number;
  @IsOptional() @IsNumber() @Type(() => Number) presionDiastolica?: number;
  @IsOptional() @IsNumber() @Type(() => Number) frecuenciaCardiaca?: number;
  @IsOptional() @IsNumber() @Type(() => Number) frecuenciaRespiratoria?: number;
  @IsOptional() @IsNumber() @Type(() => Number) saturacionOxigeno?: number;
  @IsOptional() @IsNumber() @Type(() => Number) peso?: number;
  @IsOptional() @IsNumber() @Type(() => Number) talla?: number;
  @IsOptional() @IsString() examenFisico?: string;
  @IsOptional() @IsString() diagnosticoPrincipal?: string;
  @IsOptional() @IsString() diagnosticosCIE10?: string;
  @IsOptional() @IsString() diagnosticosDescripcion?: string;
  @IsOptional() @IsString() planTratamiento?: string;
  @IsOptional() @IsString() indicaciones?: string;
  @IsOptional() @IsString() proximaCita?: string;
  @IsOptional() @IsString() proximaCitaMotivo?: string;
  @IsOptional() @IsBoolean() @Transform(({ value }) => value === 'true' || value === true) recetaGenerada?: boolean;
  @IsOptional() @IsBoolean() @Transform(({ value }) => value === 'true' || value === true) ordenLaboratorioGenerada?: boolean;
}

class RegistrarSignosDto {
  @IsOptional() @IsNumber() @Type(() => Number) temperatura?: number;
  @IsOptional() @IsNumber() @Type(() => Number) presionSistolica?: number;
  @IsOptional() @IsNumber() @Type(() => Number) presionDiastolica?: number;
  @IsOptional() @IsNumber() @Type(() => Number) frecuenciaCardiaca?: number;
  @IsOptional() @IsNumber() @Type(() => Number) frecuenciaRespiratoria?: number;
  @IsOptional() @IsNumber() @Type(() => Number) saturacionOxigeno?: number;
  @IsOptional() @IsNumber() @Type(() => Number) peso?: number;
  @IsOptional() @IsNumber() @Type(() => Number) talla?: number;
  @IsOptional() @IsNumber() @Type(() => Number) glucosa?: number;
  @IsOptional() @IsString() registradoPor?: string;
}

class MedicamentoDto {
  @IsString() medicamento!: string;
  @IsOptional() @IsString() concentracion?: string;
  @IsOptional() @IsString() forma?: string;
  @IsOptional() @IsString() via?: string;
  @IsOptional() @IsString() dosis?: string;
  @IsOptional() @IsString() frecuencia?: string;
  @IsOptional() @IsString() duracion?: string;
  @IsOptional() @IsNumber() @Type(() => Number) cantidad?: number;
  @IsOptional() @IsString() indicaciones?: string;
}

class CreateRecetaDto {
  @IsNumber() @Type(() => Number) pacienteId!: number;
  @IsNumber() @Type(() => Number) medicoId!: number;
  @IsOptional() @IsNumber() @Type(() => Number) consultaId?: number;
  @IsString() fecha!: string;
  @IsOptional() @IsString() fechaVencimiento?: string;
  @IsOptional() @IsString() diagnostico?: string;
  @IsOptional() @IsString() indicacionesGenerales?: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => MedicamentoDto) medicamentos?: MedicamentoDto[];
}

class ExamenDto {
  @IsString() examen!: string;
  @IsOptional() @IsString() categoria?: string;
}

class CreateOrdenLabDto {
  @IsNumber() @Type(() => Number) pacienteId!: number;
  @IsNumber() @Type(() => Number) medicoId!: number;
  @IsOptional() @IsNumber() @Type(() => Number) consultaId?: number;
  @IsString() fecha!: string;
  @IsOptional() @IsBoolean() @Transform(({ value }) => value === 'true' || value === true) urgente?: boolean;
  @IsOptional() @IsString() diagnosticoPresuntivo?: string;
  @IsOptional() @IsString() indicaciones?: string;
  @IsOptional() @IsString() laboratorioNombre?: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => ExamenDto) examenes?: ExamenDto[];
}

class UpdateOrdenLabDto {
  @IsOptional() @IsString() estado?: string;
  @IsOptional() @IsString() fechaResultados?: string;
  @IsOptional() @IsString() laboratorioNombre?: string;
  @IsOptional() @IsString() indicaciones?: string;
  @IsOptional() @IsBoolean() @Transform(({ value }) => value === 'true' || value === true) urgente?: boolean;
}

class ResultadoExamenDto {
  @IsNumber() @Type(() => Number) id!: number;
  @IsOptional() @IsString() resultado?: string;
  @IsOptional() @IsString() unidad?: string;
  @IsOptional() @IsString() valorReferencia?: string;
}

class RegistrarResultadosDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => ResultadoExamenDto) examenes!: ResultadoExamenDto[];
}

class CreateProcedimientoDto {
  @IsNumber() @Type(() => Number) pacienteId!: number;
  @IsNumber() @Type(() => Number) medicoId!: number;
  @IsOptional() @IsNumber() @Type(() => Number) consultaId?: number;
  @IsString() fecha!: string;
  @IsString() nombre!: string;
  @IsOptional() @IsString() descripcion?: string;
  @IsOptional() @IsNumber() @Type(() => Number) duracionMinutos?: number;
  @IsOptional() @IsString() anestesia?: string;
  @IsOptional() @IsString() sala?: string;
  @IsOptional() @IsString() estado?: string;
  @IsOptional() @IsNumber() @Type(() => Number) costo?: number;
  @IsOptional() @IsString() notas?: string;
}

class UpdateProcedimientoDto {
  @IsOptional() @IsString() nombre?: string;
  @IsOptional() @IsString() descripcion?: string;
  @IsOptional() @IsNumber() @Type(() => Number) duracionMinutos?: number;
  @IsOptional() @IsString() anestesia?: string;
  @IsOptional() @IsString() sala?: string;
  @IsOptional() @IsString() estado?: string;
  @IsOptional() @IsString() complicaciones?: string;
  @IsOptional() @IsString() notas?: string;
  @IsOptional() @IsNumber() @Type(() => Number) costo?: number;
  @IsOptional() @IsNumber() @Type(() => Number) facturaId?: number;
}

class FacturarProcedimientoDto {
  @IsNumber() @Type(() => Number) clienteId!: number;
  @IsOptional() @IsString() tipoNcf?: string;
}

class CreateArsDto {
  @IsNumber() @Type(() => Number) pacienteId!: number;
  @IsOptional() @IsNumber() @Type(() => Number) medicoId?: number;
  @IsString() arsNombre!: string;
  @IsOptional() @IsString() arsNumeroAfiliado?: string;
  @IsOptional() @IsString() tipoServicio?: string;
  @IsOptional() @IsString() descripcion?: string;
  @IsOptional() @IsNumber() @Type(() => Number) montoAutorizado?: number;
  @IsOptional() @IsNumber() @Type(() => Number) montoCubierto?: number;
  @IsOptional() @IsNumber() @Type(() => Number) montoPaciente?: number;
  @IsOptional() @IsString() fechaSolicitud?: string;
  @IsOptional() @IsString() observaciones?: string;
}

class UpdateArsDto {
  @IsOptional() @IsString() estado?: string;
  @IsOptional() @IsString() codigoAutorizacion?: string;
  @IsOptional() @IsNumber() @Type(() => Number) montoAutorizado?: number;
  @IsOptional() @IsNumber() @Type(() => Number) montoCubierto?: number;
  @IsOptional() @IsNumber() @Type(() => Number) montoPaciente?: number;
  @IsOptional() @IsString() fechaRespuesta?: string;
  @IsOptional() @IsString() observaciones?: string;
  @IsOptional() @IsNumber() @Type(() => Number) facturaId?: number;
}

class CreateCatalogoDto {
  @IsOptional() @IsString() codigo?: string;
  @IsString() nombre!: string;
  @IsOptional() @IsString() descripcion?: string;
  @IsOptional() @IsString() especialidad?: string;
  @IsOptional() @IsNumber() @Type(() => Number) precio?: number;
  @IsOptional() @IsNumber() @Type(() => Number) precioArs?: number;
  @IsOptional() @IsNumber() @Type(() => Number) duracionMinutos?: number;
  @IsOptional() @IsBoolean() @Transform(({ value }) => value === 'true' || value === true) requiereAutorizacion?: boolean;
}

class UpdateCatalogoDto {
  @IsOptional() @IsString() codigo?: string;
  @IsOptional() @IsString() nombre?: string;
  @IsOptional() @IsString() descripcion?: string;
  @IsOptional() @IsString() especialidad?: string;
  @IsOptional() @IsNumber() @Type(() => Number) precio?: number;
  @IsOptional() @IsNumber() @Type(() => Number) precioArs?: number;
  @IsOptional() @IsNumber() @Type(() => Number) duracionMinutos?: number;
  @IsOptional() @IsBoolean() @Transform(({ value }) => value === 'true' || value === true) requiereAutorizacion?: boolean;
  @IsOptional() @IsBoolean() @Transform(({ value }) => value === 'true' || value === true) isActive?: boolean;
}

// ── CONTROLLER ────────────────────────────────────────────────────────────────

@UseGuards(JwtAuthGuard, TenantGuard, ModuloAddonGuard('clinica'))
@Controller('clinica')
export class ClinicaController {
  constructor(
    private readonly svc: ClinicaService,
    private readonly pdfSvc: ClinicaPdfService,
  ) {}

  @Get('dashboard') dashboard() { return this.svc.dashboard(); }

  // PACIENTES
  @Get('pacientes')
  listarPacientes(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
  ) { return this.svc.listarPacientes(Number(page ?? 1), Number(limit ?? 20), search); }

  @Post('pacientes') crearPaciente(@Body() dto: CreatePacienteDto) { return this.svc.crearPaciente(dto); }

  @Get('pacientes/:id') obtenerPaciente(@Param('id', ParseIntPipe) id: number) { return this.svc.obtenerPaciente(id); }

  @Patch('pacientes/:id')
  actualizarPaciente(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdatePacienteDto) { return this.svc.actualizarPaciente(id, dto); }

  @Get('pacientes/:id/expediente') expediente(@Param('id', ParseIntPipe) id: number) { return this.svc.expedientePaciente(id); }

  @Get('pacientes/:id/signos')
  signosPaciente(@Param('id', ParseIntPipe) id: number) { return this.svc.signosVitalesPaciente(id); }

  // MÉDICOS
  @Get('medicos') listarMedicos() { return this.svc.listarMedicos(); }
  @Post('medicos') crearMedico(@Body() dto: CreateMedicoDto) { return this.svc.crearMedico(dto); }
  @Patch('medicos/:id') actualizarMedico(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateMedicoDto) { return this.svc.actualizarMedico(id, dto); }

  // CITAS
  @Get('citas')
  listarCitas(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('fecha') fecha?: string,
    @Query('medicoId') medicoId?: string,
    @Query('estado') estado?: string,
  ) { return this.svc.listarCitas(Number(page ?? 1), Number(limit ?? 50), fecha, medicoId ? Number(medicoId) : undefined, estado); }

  @Post('citas') crearCita(@Body() dto: CreateCitaDto) { return this.svc.crearCita(dto); }
  @Patch('citas/:id') actualizarCita(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateCitaDto) { return this.svc.actualizarCita(id, dto); }

  @Patch('citas/:id/estado')
  cambiarEstado(@Param('id', ParseIntPipe) id: number, @Body() dto: CambiarEstadoCitaDto) { return this.svc.cambiarEstadoCita(id, dto.estado); }

  @Post('citas/:id/iniciar-consulta')
  iniciarConsulta(@Param('id', ParseIntPipe) id: number, @Request() req: any) { return this.svc.iniciarConsultaDesdeCita(id, req.user?.sub); }

  // SALA DE ESPERA
  @Get('sala-espera')
  getSalaEspera(@Query('fecha') fecha?: string, @Query('medicoId') medicoId?: string) {
    return this.svc.getSalaEspera(fecha, medicoId ? Number(medicoId) : undefined);
  }
  @Post('sala-espera') registrarLlegada(@Body() dto: RegistrarLlegadaDto) { return this.svc.registrarLlegada(dto); }
  @Patch('sala-espera/:id/llamar') llamar(@Param('id', ParseIntPipe) id: number) { return this.svc.llamarPaciente(id); }
  @Patch('sala-espera/:id/atendido') atendido(@Param('id', ParseIntPipe) id: number) { return this.svc.marcarAtendido(id); }

  // CONSULTAS
  @Get('consultas')
  listarConsultas(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('pacienteId') pacienteId?: string,
    @Query('medicoId') medicoId?: string,
  ) { return this.svc.listarConsultas(Number(page ?? 1), Number(limit ?? 20), pacienteId ? Number(pacienteId) : undefined, medicoId ? Number(medicoId) : undefined); }

  @Post('consultas') crearConsulta(@Body() dto: CreateConsultaDto, @Request() req: any) { return this.svc.crearConsulta(dto, req.user?.sub); }
  @Get('consultas/:id') obtenerConsulta(@Param('id', ParseIntPipe) id: number) { return this.svc.obtenerConsulta(id); }
  @Patch('consultas/:id') actualizarConsulta(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateConsultaDto) { return this.svc.actualizarConsulta(id, dto); }
  @Post('consultas/:id/signos') registrarSignos(@Param('id', ParseIntPipe) id: number, @Body() dto: RegistrarSignosDto) { return this.svc.registrarSignos(id, dto); }

  // RECETAS
  @Get('recetas')
  listarRecetas(@Query('page') page?: string, @Query('limit') limit?: string, @Query('pacienteId') pacienteId?: string) {
    return this.svc.listarRecetas(Number(page ?? 1), Number(limit ?? 20), pacienteId ? Number(pacienteId) : undefined);
  }
  @Post('recetas') crearReceta(@Body() dto: CreateRecetaDto) { return this.svc.crearReceta(dto); }
  @Get('recetas/:id') obtenerReceta(@Param('id', ParseIntPipe) id: number) { return this.svc.obtenerReceta(id); }

  @Get('recetas/:id/pdf')
  async pdfReceta(@Param('id', ParseIntPipe) id: number, @Res({ passthrough: true }) res: Response) {
    const receta = await this.svc.obtenerReceta(id);
    const buffer = await this.pdfSvc.generarReceta(receta);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="receta-${receta.numero}.pdf"` });
    return new StreamableFile(buffer);
  }

  // LABORATORIO
  @Get('laboratorio')
  listarOrdenes(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('pacienteId') pacienteId?: string,
    @Query('estado') estado?: string,
  ) { return this.svc.listarOrdenes(Number(page ?? 1), Number(limit ?? 20), pacienteId ? Number(pacienteId) : undefined, estado); }

  @Post('laboratorio') crearOrden(@Body() dto: CreateOrdenLabDto) { return this.svc.crearOrdenLab(dto); }
  @Get('laboratorio/:id') obtenerOrden(@Param('id', ParseIntPipe) id: number) { return this.svc.obtenerOrdenLab(id); }
  @Patch('laboratorio/:id') actualizarOrden(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateOrdenLabDto) { return this.svc.actualizarOrdenLab(id, dto); }
  @Post('laboratorio/:id/resultados') resultados(@Param('id', ParseIntPipe) id: number, @Body() dto: RegistrarResultadosDto) { return this.svc.registrarResultados(id, dto.examenes); }

  @Get('laboratorio/:id/pdf')
  async pdfLab(@Param('id', ParseIntPipe) id: number, @Res({ passthrough: true }) res: Response) {
    const orden = await this.svc.obtenerOrdenLab(id);
    const buffer = await this.pdfSvc.generarOrdenLab(orden);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="lab-${orden.numero}.pdf"` });
    return new StreamableFile(buffer);
  }

  // PROCEDIMIENTOS
  @Get('procedimientos')
  listarProcedimientos(@Query('page') page?: string, @Query('limit') limit?: string, @Query('estado') estado?: string) {
    return this.svc.listarProcedimientos(Number(page ?? 1), Number(limit ?? 20), estado);
  }
  @Post('procedimientos') crearProcedimiento(@Body() dto: CreateProcedimientoDto) { return this.svc.crearProcedimiento(dto); }
  @Patch('procedimientos/:id') actualizarProc(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateProcedimientoDto) { return this.svc.actualizarProcedimiento(id, dto); }
  @Post('procedimientos/:id/facturar')
  facturarProc(@Param('id', ParseIntPipe) id: number, @Body() dto: FacturarProcedimientoDto, @Request() req: any) {
    return this.svc.facturarProcedimiento(id, dto.clienteId, req.user?.sub, dto.tipoNcf);
  }

  // ARS
  @Get('ars')
  listarArs(@Query('page') page?: string, @Query('limit') limit?: string, @Query('estado') estado?: string) {
    return this.svc.listarArs(Number(page ?? 1), Number(limit ?? 20), estado);
  }
  @Post('ars') crearArs(@Body() dto: CreateArsDto) { return this.svc.crearArs(dto); }
  @Patch('ars/:id') actualizarArs(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateArsDto) { return this.svc.actualizarArs(id, dto); }

  // CATÁLOGO
  @Get('catalogo')
  listarCatalogo(@Query('especialidad') especialidad?: string) { return this.svc.listarCatalogo(especialidad); }
  @Post('catalogo') crearCatalogo(@Body() dto: CreateCatalogoDto) { return this.svc.crearCatalogo(dto); }
  @Patch('catalogo/:id') actualizarCatalogo(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateCatalogoDto) { return this.svc.actualizarCatalogo(id, dto); }

  // EXPEDIENTE PDF
  @Get('pacientes/:id/expediente/pdf')
  async pdfExpediente(@Param('id', ParseIntPipe) id: number, @Res({ passthrough: true }) res: Response) {
    const expediente = await this.svc.expedientePaciente(id);
    const buffer = await this.pdfSvc.generarExpediente(expediente);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="expediente-${expediente.paciente.codigo}.pdf"` });
    return new StreamableFile(buffer);
  }

  // REPORTES
  @Get('reportes')
  reportes(
    @Query('tipo') tipo: string,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
  ) { return this.svc.reportes(tipo, desde, hasta); }
}
