import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query,
  ParseIntPipe, HttpCode, HttpStatus, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import {
  IsString, IsOptional, IsEnum, IsNumber, IsInt, IsPositive,
  IsDateString, Min, IsBoolean,
} from 'class-validator';
import { ManufacturaService } from './manufactura.service';
import { ManufacturaAvanzadaService } from './manufactura-avanzada.service';
import { EstadoOrdenProduccion } from './entities/orden-produccion.entity';
import { TipoCentroTrabajo } from './entities/centro-trabajo.entity';
import { EstadoEtapaOrden } from './entities/registro-etapa-orden.entity';
import { PaginationDto } from '../common/dto/pagination.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { User } from '../users/users.entity';

class CreateLMDto {
  @IsString()                         codigo!:            string;
  @IsString()                         nombre!:            string;
  @IsOptional() @IsString()           descripcion?:       string;
  @IsInt() @IsPositive()              productoFinalId!:   number;
  @IsOptional() @IsNumber() @Min(0)   rendimiento?:       number;
  @IsOptional() @IsString()           unidadRendimiento?: string;
}

class CreateComponenteDto {
  @IsInt() @IsPositive()              productoId!: number;
  @IsNumber() @Min(0)                 cantidad!:   number;
  @IsOptional() @IsString()           unidad?:     string;
  @IsOptional() @IsString()           notas?:      string;
  @IsOptional() @IsInt() @Min(0)      orden?:      number;
}

class CreateOrdenDto {
  @IsInt() @IsPositive()              listaId!:               number;
  @IsNumber() @Min(0)                 cantidadPlanificada!:   number;
  @IsDateString()                     fechaInicio!:           string;
  @IsOptional() @IsDateString()       fechaFinPlanificada?:   string;
  @IsOptional() @IsString()           notas?:                 string;
  @IsOptional() @IsInt()              responsableId?:         number;
}

class CambiarEstadoOrdenDto {
  @IsEnum(EstadoOrdenProduccion)      estado!:              EstadoOrdenProduccion;
  @IsOptional() @IsNumber() @Min(0)   cantidadProducida?:   number;
}

class CreateCentroDto {
  @IsString()                           nombre!:              string;
  @IsOptional() @IsString()             descripcion?:         string;
  @IsOptional() @IsEnum(TipoCentroTrabajo) tipo?:             TipoCentroTrabajo;
  @IsOptional() @IsNumber() @Min(0)     capacidadHorasDia?:   number;
  @IsOptional() @IsNumber() @Min(0)     costoHora?:           number;
  @IsOptional() @IsString()             responsable?:         string;
  @IsOptional() @IsString()             ubicacion?:           string;
}

class EtapaDto {
  @IsOptional() @IsInt() @IsPositive()  centroTrabajoId?:               number;
  @IsString()                           nombre!:                        string;
  @IsInt() @Min(1)                      orden!:                         number;
  @IsOptional() @IsNumber() @Min(0)     tiempoSetupMin?:                number;
  @IsOptional() @IsNumber() @Min(0)     tiempoOperacionMinPorUnidad?:   number;
  @IsOptional() @IsString()             descripcion?:                   string;
  @IsOptional() @IsBoolean()            esControl?:                     boolean;
}

class CreateRutaDto {
  @IsString()                           codigo!:       string;
  @IsString()                           nombre!:       string;
  @IsOptional() @IsString()             descripcion?:  string;
  @IsOptional() @IsInt() @IsPositive()  listaId?:      number;
  @IsOptional()                         etapas?:       EtapaDto[];
}

class AvanzarEtapaDto {
  @IsEnum(EstadoEtapaOrden)             estado!:              EstadoEtapaOrden;
  @IsOptional() @IsNumber() @Min(0)     cantidadProcesada?:   number;
  @IsOptional() @IsInt()                operadorId?:          number;
  @IsOptional() @IsString()             observaciones?:       string;
}

@ApiTags('Manufactura & Producción')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR)
@Controller('manufactura')
export class ManufacturaController {
  constructor(
    private svc: ManufacturaService,
    private avanzado: ManufacturaAvanzadaService,
  ) {}

  @Get('dashboard')
  getDashboard() { return this.svc.getDashboard(); }

  // BOM - Listas de Materiales
  @Post('lm')
  @HttpCode(HttpStatus.CREATED)
  crearLM(@Body() dto: CreateLMDto) { return this.svc.crearLM(dto); }

  @Get('lm')
  listarLM() { return this.svc.listarLM(); }

  @Get('lm/:id')
  getLM(@Param('id', ParseIntPipe) id: number) { return this.svc.getLM(id); }

  @Patch('lm/:id')
  actualizarLM(@Param('id', ParseIntPipe) id: number, @Body() dto: CreateLMDto) {
    return this.svc.actualizarLM(id, dto);
  }

  @Delete('lm/:id')
  @Roles(UserRole.ADMIN)
  eliminarLM(@Param('id', ParseIntPipe) id: number) { return this.svc.eliminarLM(id); }

  // Componentes
  @Post('lm/:id/componentes')
  @HttpCode(HttpStatus.CREATED)
  agregarComponente(@Param('id', ParseIntPipe) id: number, @Body() dto: CreateComponenteDto) {
    return this.svc.agregarComponente(id, dto);
  }

  @Patch('componentes/:id')
  actualizarComponente(@Param('id', ParseIntPipe) id: number, @Body() dto: CreateComponenteDto) {
    return this.svc.actualizarComponente(id, dto);
  }

  @Delete('componentes/:id')
  eliminarComponente(@Param('id', ParseIntPipe) id: number) {
    return this.svc.eliminarComponente(id);
  }

  // Órdenes de producción
  @Post('ordenes')
  @HttpCode(HttpStatus.CREATED)
  crearOrden(@Body() dto: CreateOrdenDto) { return this.svc.crearOrden(dto); }

  @Get('ordenes')
  listarOrdenes(
    @Query() pagination: PaginationDto,
    @Query('estado') estado?: EstadoOrdenProduccion,
  ) { return this.svc.listarOrdenes(pagination, estado); }

  @Get('ordenes/:id')
  getOrden(@Param('id', ParseIntPipe) id: number) { return this.svc.getOrden(id); }

  @Patch('ordenes/:id/estado')
  cambiarEstado(@Param('id', ParseIntPipe) id: number, @Body() dto: CambiarEstadoOrdenDto) {
    return this.svc.cambiarEstado(id, dto.estado, dto.cantidadProducida);
  }

  @Delete('ordenes/:id')
  @Roles(UserRole.ADMIN)
  eliminarOrden(@Param('id', ParseIntPipe) id: number) { return this.svc.eliminarOrden(id); }

  // ── Centros de Trabajo ──────────────────────────────────────────────────────

  @Post('centros')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Crear centro de trabajo (máquina, área manual, subcontratado)' })
  crearCentro(@Body() dto: CreateCentroDto) { return this.avanzado.crearCentro(dto); }

  @Get('centros')
  @ApiOperation({ summary: 'Listar centros de trabajo activos' })
  getCentros() { return this.avanzado.getCentros(); }

  @Patch('centros/:id')
  @ApiOperation({ summary: 'Actualizar centro de trabajo' })
  updateCentro(@Param('id', ParseIntPipe) id: number, @Body() dto: CreateCentroDto) {
    return this.avanzado.updateCentro(id, dto as any);
  }

  @Delete('centros/:id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Eliminar centro de trabajo' })
  deleteCentro(@Param('id', ParseIntPipe) id: number) { return this.avanzado.deleteCentro(id); }

  // ── Rutas de Producción ─────────────────────────────────────────────────────

  @Post('rutas')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Crear ruta de producción con etapas' })
  crearRuta(@Body() dto: CreateRutaDto) { return this.avanzado.crearRuta(dto); }

  @Get('rutas')
  @ApiOperation({ summary: 'Listar rutas de producción' })
  getRutas(@Query('listaId') listaId?: string) {
    return this.avanzado.getRutas(listaId ? Number(listaId) : undefined);
  }

  @Get('rutas/:id')
  @ApiOperation({ summary: 'Detalle de ruta con etapas y tiempos' })
  getRuta(@Param('id', ParseIntPipe) id: number) { return this.avanzado.getRuta(id); }

  @Post('rutas/:id/etapas')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Agregar etapa a ruta' })
  agregarEtapa(@Param('id', ParseIntPipe) id: number, @Body() dto: EtapaDto) {
    return this.avanzado.agregarEtapa(id, dto);
  }

  @Patch('etapas/:id')
  @ApiOperation({ summary: 'Actualizar etapa de ruta' })
  updateEtapa(@Param('id', ParseIntPipe) id: number, @Body() dto: EtapaDto) {
    return this.avanzado.updateEtapa(id, dto as any);
  }

  @Delete('etapas/:id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Eliminar etapa de ruta' })
  deleteEtapa(@Param('id', ParseIntPipe) id: number) { return this.avanzado.deleteEtapa(id); }

  // ── WIP — Trabajo en Proceso ────────────────────────────────────────────────

  @Post('ordenes/:id/asignar-ruta/:rutaId')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Asignar ruta de producción a una orden — genera registros de etapas' })
  asignarRuta(
    @Param('id',     ParseIntPipe) ordenId: number,
    @Param('rutaId', ParseIntPipe) rutaId:  number,
  ) { return this.avanzado.asignarRutaAOrden(ordenId, rutaId); }

  @Get('ordenes/:id/wip')
  @ApiOperation({ summary: 'Estado WIP de una orden — progreso por etapa' })
  getWIPOrden(@Param('id', ParseIntPipe) id: number) { return this.avanzado.getWIPOrden(id); }

  @Patch('registros-etapa/:id/avanzar')
  @ApiOperation({ summary: 'Avanzar estado de una etapa (iniciar, completar, rechazar)' })
  avanzarEtapa(@Param('id', ParseIntPipe) id: number, @Body() dto: AvanzarEtapaDto) {
    return this.avanzado.avanzarEtapa(id, dto);
  }

  @Get('wip/resumen')
  @ApiOperation({ summary: 'Resumen WIP de todas las órdenes en proceso' })
  getWIPResumen() { return this.avanzado.getWIPResumen(); }
}
