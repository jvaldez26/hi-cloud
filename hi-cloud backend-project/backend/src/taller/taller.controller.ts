import {
  Controller, Get, Post, Put, Patch, Delete, Body, Param, Query,
  UseGuards, Request, ParseIntPipe, DefaultValuePipe, ParseBoolPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import {
  IsString, IsOptional, IsInt, IsBoolean, IsNumber, IsEnum,
  MinLength, Min, IsPositive,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../tenant/tenant.guard';
import { ModuloAddonGuard } from '../modulos-addon/guards/modulo-addon.guard';
import { TallerService } from './taller.service';
import { TallerPdfService } from './taller-pdf.service';

// ── DTOs ─────────────────────────────────────────────────────────────────────

class CreateVehiculoDto {
  @IsString() @MinLength(1) placa!: string;
  @IsOptional() @IsString() vin?: string;
  @IsString() @MinLength(1) marca!: string;
  @IsString() @MinLength(1) modelo!: string;
  @IsOptional() @IsInt() @Type(() => Number) anio?: number;
  @IsOptional() @IsString() color?: string;
  @IsOptional() @IsString() tipo?: string;
  @IsOptional() @IsString() combustible?: string;
  @IsOptional() @IsString() transmision?: string;
  @IsOptional() @IsString() cilindraje?: string;
  @IsOptional() @IsNumber() @Type(() => Number) kilometrajeActual?: number;
  @IsOptional() @IsString() propietarioNombre?: string;
  @IsOptional() @IsString() propietarioTelefono?: string;
  @IsOptional() @IsString() propietarioEmail?: string;
  @IsOptional() @IsInt() @Type(() => Number) clienteId?: number;
  @IsOptional() @IsString() observaciones?: string;
  @IsOptional() @IsString() imagenUrl?: string;
}

class UpdateVehiculoDto {
  @IsOptional() @IsString() placa?: string;
  @IsOptional() @IsString() vin?: string;
  @IsOptional() @IsString() marca?: string;
  @IsOptional() @IsString() modelo?: string;
  @IsOptional() @IsInt() @Type(() => Number) anio?: number;
  @IsOptional() @IsString() color?: string;
  @IsOptional() @IsString() tipo?: string;
  @IsOptional() @IsString() combustible?: string;
  @IsOptional() @IsString() transmision?: string;
  @IsOptional() @IsString() cilindraje?: string;
  @IsOptional() @IsNumber() @Type(() => Number) kilometrajeActual?: number;
  @IsOptional() @IsNumber() @Type(() => Number) kilometrajeUltimoServicio?: number;
  @IsOptional() @IsNumber() @Type(() => Number) proximoServicioKm?: number;
  @IsOptional() @IsString() propietarioNombre?: string;
  @IsOptional() @IsString() propietarioTelefono?: string;
  @IsOptional() @IsString() propietarioEmail?: string;
  @IsOptional() @IsInt() @Type(() => Number) clienteId?: number;
  @IsOptional() @IsString() observaciones?: string;
  @IsOptional() @IsString() imagenUrl?: string;
  @IsOptional() @IsBoolean() @Transform(({ value }) => value === true || value === 'true') isActive?: boolean;
}

class CreateTecnicoDto {
  @IsString() @MinLength(1) nombre!: string;
  @IsOptional() @IsString() especialidad?: string;
  @IsOptional() @IsString() telefono?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsNumber() @Type(() => Number) tarifaHora?: number;
  @IsOptional() @IsInt() @Type(() => Number) empleadoId?: number;
}

class UpdateTecnicoDto {
  @IsOptional() @IsString() nombre?: string;
  @IsOptional() @IsString() especialidad?: string;
  @IsOptional() @IsString() telefono?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsNumber() @Type(() => Number) tarifaHora?: number;
  @IsOptional() @IsInt() @Type(() => Number) empleadoId?: number;
  @IsOptional() @IsBoolean() @Transform(({ value }) => value === true || value === 'true') isActive?: boolean;
}

class CreateOrdenDto {
  @IsInt() @Type(() => Number) vehiculoId!: number;
  @IsOptional() @IsInt() @Type(() => Number) clienteId?: number;
  @IsString() @MinLength(1) motivoIngreso!: string;
  @IsOptional() @IsString() diagnosticoInicial?: string;
  @IsOptional() @IsInt() @Type(() => Number) tecnicoId?: number;
  @IsOptional() @IsString() prioridad?: string;
  @IsOptional() @IsString() fechaEstimadaEntrega?: string;
  @IsOptional() @IsNumber() @Type(() => Number) kilometrajeIngreso?: number;
  @IsOptional() @IsString() nivelCombustible?: string;
  @IsOptional() @IsBoolean() @Transform(({ value }) => value === true || value === 'true') tieneRayones?: boolean;
  @IsOptional() @IsBoolean() @Transform(({ value }) => value === true || value === 'true') tieneGolpes?: boolean;
  @IsOptional() @IsBoolean() @Transform(({ value }) => value === true || value === 'true') tieneDocumentos?: boolean;
  @IsOptional() @IsBoolean() @Transform(({ value }) => value === true || value === 'true') tieneGato?: boolean;
  @IsOptional() @IsBoolean() @Transform(({ value }) => value === true || value === 'true') tieneHerramientas?: boolean;
  @IsOptional() @IsString() observacionesIngreso?: string;
  @IsOptional() @IsInt() @Type(() => Number) garantiaDias?: number;
  @IsOptional() @IsNumber() @Type(() => Number) garantiaKm?: number;
  @IsOptional() @IsString() notas?: string;
}

class UpdateOrdenDto {
  @IsOptional() @IsInt() @Type(() => Number) vehiculoId?: number;
  @IsOptional() @IsInt() @Type(() => Number) clienteId?: number;
  @IsOptional() @IsInt() @Type(() => Number) tecnicoId?: number;
  @IsOptional() @IsString() motivoIngreso?: string;
  @IsOptional() @IsString() diagnosticoInicial?: string;
  @IsOptional() @IsString() prioridad?: string;
  @IsOptional() @IsString() fechaEstimadaEntrega?: string;
  @IsOptional() @IsNumber() @Type(() => Number) kilometrajeIngreso?: number;
  @IsOptional() @IsString() nivelCombustible?: string;
  @IsOptional() @IsBoolean() @Transform(({ value }) => value === true || value === 'true') tieneRayones?: boolean;
  @IsOptional() @IsBoolean() @Transform(({ value }) => value === true || value === 'true') tieneGolpes?: boolean;
  @IsOptional() @IsBoolean() @Transform(({ value }) => value === true || value === 'true') tieneDocumentos?: boolean;
  @IsOptional() @IsBoolean() @Transform(({ value }) => value === true || value === 'true') tieneGato?: boolean;
  @IsOptional() @IsBoolean() @Transform(({ value }) => value === true || value === 'true') tieneHerramientas?: boolean;
  @IsOptional() @IsString() observacionesIngreso?: string;
  @IsOptional() @IsInt() @Type(() => Number) garantiaDias?: number;
  @IsOptional() @IsNumber() @Type(() => Number) garantiaKm?: number;
  @IsOptional() @IsNumber() @Type(() => Number) descuento?: number;
  @IsOptional() @IsString() notas?: string;
}

class CambiarEstadoDto {
  @IsString() @MinLength(1) estado!: string;
  @IsOptional() @IsString() notas?: string;
}

class AprobarOrdenDto {
  @IsOptional() @IsString() aprobadoPor?: string;
  @IsOptional() @IsString() formaAprobacion?: string;
}

class FacturarOrdenDto {
  @IsInt() @Type(() => Number) clienteId!: number;
  @IsOptional() @IsString() tipoNcf?: string;
}

class AddServicioDto {
  @IsString() @MinLength(1) descripcion!: string;
  @IsOptional() @IsString() categoria?: string;
  @IsOptional() @IsNumber() @Type(() => Number) horasEstimadas?: number;
  @IsOptional() @IsNumber() @Type(() => Number) horasReales?: number;
  @IsOptional() @IsNumber() @Type(() => Number) tarifaHora?: number;
  @IsNumber() @Type(() => Number) precioUnitario!: number;
  @IsOptional() @IsNumber() @Type(() => Number) cantidad?: number;
  @IsOptional() @IsNumber() @Type(() => Number) descuento?: number;
  @IsOptional() @IsInt() @Type(() => Number) tecnicoId?: number;
  @IsOptional() @IsString() notas?: string;
}

class UpdateServicioDto {
  @IsOptional() @IsString() descripcion?: string;
  @IsOptional() @IsString() categoria?: string;
  @IsOptional() @IsNumber() @Type(() => Number) horasEstimadas?: number;
  @IsOptional() @IsNumber() @Type(() => Number) horasReales?: number;
  @IsOptional() @IsNumber() @Type(() => Number) tarifaHora?: number;
  @IsOptional() @IsNumber() @Type(() => Number) precioUnitario?: number;
  @IsOptional() @IsNumber() @Type(() => Number) cantidad?: number;
  @IsOptional() @IsNumber() @Type(() => Number) descuento?: number;
  @IsOptional() @IsString() estado?: string;
  @IsOptional() @IsInt() @Type(() => Number) tecnicoId?: number;
  @IsOptional() @IsString() notas?: string;
}

class AddRepuestoDto {
  @IsString() @MinLength(1) descripcion!: string;
  @IsOptional() @IsString() referencia?: string;
  @IsOptional() @IsString() marca?: string;
  @IsOptional() @IsInt() @Type(() => Number) productoId?: number;
  @IsOptional() @IsNumber() @Type(() => Number) cantidad?: number;
  @IsOptional() @IsNumber() @Type(() => Number) costoUnitario?: number;
  @IsNumber() @Type(() => Number) precioUnitario!: number;
  @IsOptional() @IsNumber() @Type(() => Number) descuento?: number;
  @IsOptional() @IsString() origen?: string;
  @IsOptional() @IsString() notas?: string;
}

class UpdateRepuestoDto {
  @IsOptional() @IsString() descripcion?: string;
  @IsOptional() @IsString() referencia?: string;
  @IsOptional() @IsString() marca?: string;
  @IsOptional() @IsInt() @Type(() => Number) productoId?: number;
  @IsOptional() @IsNumber() @Type(() => Number) cantidad?: number;
  @IsOptional() @IsNumber() @Type(() => Number) costoUnitario?: number;
  @IsOptional() @IsNumber() @Type(() => Number) precioUnitario?: number;
  @IsOptional() @IsNumber() @Type(() => Number) descuento?: number;
  @IsOptional() @IsString() origen?: string;
  @IsOptional() @IsString() notas?: string;
}

class AddDiagnosticoDto {
  @IsOptional() @IsInt() @Type(() => Number) tecnicoId?: number;
  @IsOptional() @IsString() sistema?: string;
  @IsString() @MinLength(1) descripcion!: string;
  @IsOptional() @IsString() severidad?: string;
  @IsOptional() @IsString() recomendacion?: string;
  @IsOptional() @IsBoolean() @Transform(({ value }) => value === true || value === 'true') requiereAtencionInmediata?: boolean;
  @IsOptional() @IsBoolean() @Transform(({ value }) => value === true || value === 'true') incluidoEnPresupuesto?: boolean;
  @IsOptional() @IsNumber() @Type(() => Number) costoEstimado?: number;
  @IsOptional() @IsString() imagenUrl?: string;
}

class ChecklistDto {
  @IsOptional() @IsString() motorAceite?: string;
  @IsOptional() @IsString() motorRefrigerante?: string;
  @IsOptional() @IsString() motorCorreas?: string;
  @IsOptional() @IsString() motorFiltroAire?: string;
  @IsOptional() @IsString() motorBujias?: string;
  @IsOptional() @IsString() frenosPastillas?: string;
  @IsOptional() @IsString() frenosDiscos?: string;
  @IsOptional() @IsString() frenosLiquido?: string;
  @IsOptional() @IsString() frenosMano?: string;
  @IsOptional() @IsString() suspensionAmortiguadores?: string;
  @IsOptional() @IsString() suspensionBrazos?: string;
  @IsOptional() @IsString() suspensionBujes?: string;
  @IsOptional() @IsString() llantaDelanteraIzq?: string;
  @IsOptional() @IsString() llantaDelanteraDer?: string;
  @IsOptional() @IsString() llantaTraseraIzq?: string;
  @IsOptional() @IsString() llantaTraseraDer?: string;
  @IsOptional() @IsString() llantaRepuesto?: string;
  @IsOptional() @IsString() electricoBateria?: string;
  @IsOptional() @IsString() electricoAlternador?: string;
  @IsOptional() @IsString() electricoLuces?: string;
  @IsOptional() @IsString() acFuncionamiento?: string;
  @IsOptional() @IsString() acGas?: string;
  @IsOptional() @IsString() acFiltro?: string;
  @IsOptional() @IsString() limpiaparabrisas?: string;
  @IsOptional() @IsString() nivelLiquidos?: string;
  @IsOptional() @IsString() observaciones?: string;
  @IsOptional() @IsString() inspeccionadoPor?: string;
}

class CreateCitaDto {
  @IsOptional() @IsInt() @Type(() => Number) vehiculoId?: number;
  @IsOptional() @IsInt() @Type(() => Number) clienteId?: number;
  @IsOptional() @IsInt() @Type(() => Number) tecnicoId?: number;
  @IsString() fecha!: string;
  @IsString() hora!: string;
  @IsOptional() @IsInt() @Type(() => Number) duracionMinutos?: number;
  @IsOptional() @IsString() tipoServicio?: string;
  @IsOptional() @IsString() descripcion?: string;
  @IsOptional() @IsString() estado?: string;
  @IsOptional() @IsString() notas?: string;
}

class UpdateCitaDto {
  @IsOptional() @IsInt() @Type(() => Number) vehiculoId?: number;
  @IsOptional() @IsInt() @Type(() => Number) clienteId?: number;
  @IsOptional() @IsInt() @Type(() => Number) tecnicoId?: number;
  @IsOptional() @IsString() fecha?: string;
  @IsOptional() @IsString() hora?: string;
  @IsOptional() @IsInt() @Type(() => Number) duracionMinutos?: number;
  @IsOptional() @IsString() tipoServicio?: string;
  @IsOptional() @IsString() descripcion?: string;
  @IsOptional() @IsString() estado?: string;
  @IsOptional() @IsString() notas?: string;
}

class CreateCatalogoDto {
  @IsString() @MinLength(1) nombre!: string;
  @IsOptional() @IsString() descripcion?: string;
  @IsOptional() @IsString() categoria?: string;
  @IsOptional() @IsNumber() @Type(() => Number) precioBase?: number;
  @IsOptional() @IsNumber() @Type(() => Number) horasEstimadas?: number;
}

class UpdateCatalogoDto {
  @IsOptional() @IsString() nombre?: string;
  @IsOptional() @IsString() descripcion?: string;
  @IsOptional() @IsString() categoria?: string;
  @IsOptional() @IsNumber() @Type(() => Number) precioBase?: number;
  @IsOptional() @IsNumber() @Type(() => Number) horasEstimadas?: number;
  @IsOptional() @IsBoolean() @Transform(({ value }) => value === true || value === 'true') isActive?: boolean;
}

// ── CONTROLLER ────────────────────────────────────────────────────────────────

@Controller('taller')
@ApiTags('Taller Mecánico')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard, ModuloAddonGuard('taller'))
export class TallerController {
  constructor(
    private readonly svc: TallerService,
    private readonly pdfSvc: TallerPdfService,
  ) {}

  // DASHBOARD
  @Get('dashboard')
  @ApiOperation({ summary: 'KPIs del taller' })
  dashboard() { return this.svc.dashboard(); }

  // ── VEHÍCULOS ────────────────────────────────────────────────────────────
  @Get('vehiculos')
  listarVehiculos(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('search') search?: string,
    @Query('clienteId') clienteId?: string,
  ) {
    return this.svc.listarVehiculos(page, limit, search, clienteId ? +clienteId : undefined);
  }

  @Post('vehiculos')
  crearVehiculo(@Body() dto: CreateVehiculoDto) {
    return this.svc.crearVehiculo(dto);
  }

  @Get('vehiculos/buscar-placa')
  buscarPorPlaca(@Query('placa') placa: string) {
    return this.svc.buscarPorPlaca(placa);
  }

  @Get('vehiculos/:id')
  obtenerVehiculo(@Param('id', ParseIntPipe) id: number) {
    return this.svc.obtenerVehiculo(id);
  }

  @Put('vehiculos/:id')
  actualizarVehiculo(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateVehiculoDto,
  ) {
    return this.svc.actualizarVehiculo(id, dto);
  }

  @Get('vehiculos/:id/historial')
  historialVehiculo(@Param('id', ParseIntPipe) id: number) {
    return this.svc.historialVehiculo(id);
  }

  @Get('vehiculos/:id/ordenes')
  ordenesVehiculo(@Param('id', ParseIntPipe) id: number) {
    return this.svc.ordenesVehiculo(id);
  }

  // ── TÉCNICOS ─────────────────────────────────────────────────────────────
  @Get('tecnicos')
  listarTecnicos() { return this.svc.listarTecnicos(); }

  @Post('tecnicos')
  crearTecnico(@Body() dto: CreateTecnicoDto) { return this.svc.crearTecnico(dto); }

  @Put('tecnicos/:id')
  actualizarTecnico(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTecnicoDto,
  ) { return this.svc.actualizarTecnico(id, dto); }

  // ── ÓRDENES ──────────────────────────────────────────────────────────────
  @Get('ordenes')
  listarOrdenes(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('estado') estado?: string,
    @Query('tecnicoId') tecnicoId?: string,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
    @Query('vehiculoId') vehiculoId?: string,
    @Query('search') search?: string,
  ) {
    return this.svc.listarOrdenes(
      page, limit, estado, tecnicoId ? +tecnicoId : undefined,
      desde, hasta, vehiculoId ? +vehiculoId : undefined, search,
    );
  }

  @Post('ordenes')
  crearOrden(@Body() dto: CreateOrdenDto, @Request() req: any) {
    return this.svc.crearOrden(dto, req.user.sub ?? req.user.id);
  }

  @Get('ordenes/:id')
  obtenerOrden(@Param('id', ParseIntPipe) id: number) {
    return this.svc.obtenerOrden(id);
  }

  @Put('ordenes/:id')
  actualizarOrden(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateOrdenDto,
  ) { return this.svc.actualizarOrden(id, dto); }

  @Patch('ordenes/:id/estado')
  cambiarEstado(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CambiarEstadoDto,
  ) { return this.svc.cambiarEstado(id, dto.estado, dto.notas); }

  @Patch('ordenes/:id/aprobar')
  aprobarOrden(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AprobarOrdenDto,
  ) { return this.svc.aprobarOrden(id, dto); }

  @Post('ordenes/:id/facturar')
  facturarOrden(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: FacturarOrdenDto,
    @Request() req: any,
  ) { return this.svc.facturarOrden(id, dto.clienteId, req.user.sub ?? req.user.id, dto.tipoNcf); }

  @Get('ordenes/:id/pdf')
  async pdfOrden(@Param('id', ParseIntPipe) id: number, @Request() req: any) {
    const [, res] = [, req.res];
    const orden = await this.svc.obtenerOrden(id);
    const buffer = await this.pdfSvc.generarOrdenServicio(orden);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="OS-${orden.numero}.pdf"`);
    res.end(buffer);
  }

  @Get('ordenes/:id/pdf-presupuesto')
  async pdfPresupuesto(@Param('id', ParseIntPipe) id: number, @Request() req: any) {
    const res = req.res;
    const orden = await this.svc.obtenerOrden(id);
    const buffer = await this.pdfSvc.generarPresupuesto(orden);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="PRES-${orden.numero}.pdf"`);
    res.end(buffer);
  }

  // ── SERVICIOS DE ORDEN ───────────────────────────────────────────────────
  @Post('ordenes/:id/servicios')
  agregarServicio(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AddServicioDto,
  ) { return this.svc.agregarServicio(id, dto); }

  @Put('ordenes/:id/servicios/:sid')
  actualizarServicio(
    @Param('id', ParseIntPipe) id: number,
    @Param('sid', ParseIntPipe) sid: number,
    @Body() dto: UpdateServicioDto,
  ) { return this.svc.actualizarServicio(id, sid, dto); }

  @Delete('ordenes/:id/servicios/:sid')
  eliminarServicio(
    @Param('id', ParseIntPipe) id: number,
    @Param('sid', ParseIntPipe) sid: number,
  ) { return this.svc.eliminarServicio(id, sid); }

  // ── REPUESTOS DE ORDEN ───────────────────────────────────────────────────
  @Post('ordenes/:id/repuestos')
  agregarRepuesto(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AddRepuestoDto,
  ) { return this.svc.agregarRepuesto(id, dto); }

  @Put('ordenes/:id/repuestos/:rid')
  actualizarRepuesto(
    @Param('id', ParseIntPipe) id: number,
    @Param('rid', ParseIntPipe) rid: number,
    @Body() dto: UpdateRepuestoDto,
  ) { return this.svc.actualizarRepuesto(id, rid, dto); }

  @Delete('ordenes/:id/repuestos/:rid')
  eliminarRepuesto(
    @Param('id', ParseIntPipe) id: number,
    @Param('rid', ParseIntPipe) rid: number,
  ) { return this.svc.eliminarRepuesto(id, rid); }

  // ── DIAGNÓSTICO ──────────────────────────────────────────────────────────
  @Post('ordenes/:id/diagnosticos')
  agregarDiagnostico(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AddDiagnosticoDto,
  ) { return this.svc.agregarDiagnostico(id, dto); }

  @Get('ordenes/:id/diagnosticos')
  listarDiagnosticos(@Param('id', ParseIntPipe) id: number) {
    return this.svc.listarDiagnosticos(id);
  }

  // ── CHECKLIST ────────────────────────────────────────────────────────────
  @Put('ordenes/:id/checklist')
  guardarChecklist(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ChecklistDto,
  ) { return this.svc.guardarChecklist(id, dto); }

  @Get('ordenes/:id/checklist')
  obtenerChecklist(@Param('id', ParseIntPipe) id: number) {
    return this.svc.obtenerChecklist(id);
  }

  // ── CITAS ─────────────────────────────────────────────────────────────────
  @Get('citas')
  listarCitas(
    @Query('fecha') fecha?: string,
    @Query('tecnicoId') tecnicoId?: string,
    @Query('estado') estado?: string,
  ) { return this.svc.listarCitas(fecha, tecnicoId ? +tecnicoId : undefined, estado); }

  @Post('citas')
  crearCita(@Body() dto: CreateCitaDto) { return this.svc.crearCita(dto); }

  @Put('citas/:id')
  actualizarCita(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCitaDto,
  ) { return this.svc.actualizarCita(id, dto); }

  // ── CATÁLOGO ──────────────────────────────────────────────────────────────
  @Get('catalogo')
  listarCatalogo() { return this.svc.listarCatalogo(); }

  @Post('catalogo')
  crearServicioCatalogo(@Body() dto: CreateCatalogoDto) {
    return this.svc.crearServicioCatalogo(dto);
  }

  @Put('catalogo/:id')
  actualizarServicioCatalogo(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCatalogoDto,
  ) { return this.svc.actualizarServicioCatalogo(id, dto); }

  // ── REPORTES ──────────────────────────────────────────────────────────────
  @Get('reportes/productividad')
  reporteProductividad(@Query('desde') desde?: string, @Query('hasta') hasta?: string) {
    return this.svc.reporteProductividad(desde, hasta);
  }

  @Get('reportes/servicios-mas-solicitados')
  reporteServiciosMasSolicitados(@Query('desde') desde?: string, @Query('hasta') hasta?: string) {
    return this.svc.reporteServiciosMasSolicitados(desde, hasta);
  }

  @Get('reportes/ingresos')
  reporteIngresos(@Query('desde') desde?: string, @Query('hasta') hasta?: string) {
    return this.svc.reporteIngresos(desde, hasta);
  }

  @Get('reportes/vehiculos-frecuentes')
  reporteVehiculosFrecuentes(@Query('desde') desde?: string, @Query('hasta') hasta?: string) {
    return this.svc.reporteVehiculosFrecuentes(desde, hasta);
  }
}
