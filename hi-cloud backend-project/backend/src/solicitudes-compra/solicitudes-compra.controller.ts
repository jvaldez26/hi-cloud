import {
  Controller, Get, Post, Patch, Body, Param, Query,
  ParseIntPipe, HttpCode, HttpStatus, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import {
  IsString, IsOptional, IsEnum, IsNumber, IsInt, IsPositive,
  Min, IsDateString, IsArray, ValidateNested, ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { SolicitudesCompraService } from './solicitudes-compra.service';
import { EstadoSolicitudCompra, PrioridadSolicitud } from './entities/solicitud-compra.entity';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { User } from '../users/users.entity';

class LineaSolicitudDto {
  @IsString()                           descripcion!:         string;
  @IsNumber() @Min(0.0001)              cantidad!:            number;
  @IsOptional() @IsString()             unidad?:              string;
  @IsOptional() @IsInt() @IsPositive()  productoId?:          number;
  @IsOptional() @IsNumber() @Min(0)     presupuestoUnitario?: number;
  @IsOptional() @IsString()             especificaciones?:    string;
}

class CreateSolicitudDto {
  @IsString()                                    justificacion!:       string;
  @IsOptional() @IsDateString()                  fechaNecesidad?:      string;
  @IsOptional() @IsEnum(PrioridadSolicitud)      prioridad?:           PrioridadSolicitud;
  @IsOptional() @IsString()                      departamento?:        string;
  @IsOptional() @IsNumber() @Min(0)              presupuestoEstimado?: number;
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true })
  @Type(() => LineaSolicitudDto)
  lineas!: LineaSolicitudDto[];
}

class CambiarEstadoSolicitudDto {
  @IsEnum(EstadoSolicitudCompra)   estado!:      EstadoSolicitudCompra;
  @IsOptional() @IsString()        comentario?:  string;
}

class LineaCotizacionDto {
  @IsString()                           descripcion!:       string;
  @IsNumber() @Min(0.0001)              cantidad!:          number;
  @IsNumber() @Min(0)                   precioUnitario!:    number;
  @IsOptional() @IsNumber() @Min(0)     porcentajeItbis?:   number;
  @IsOptional() @IsString()             unidad?:            string;
  @IsOptional() @IsInt() @IsPositive()  productoId?:        number;
}

class CreateCotizacionDto {
  @IsOptional() @IsInt() @IsPositive()  solicitudId?:       number;
  @IsInt() @IsPositive()                proveedorId!:       number;
  @IsOptional() @IsDateString()         fechaEnvio?:        string;
  @IsOptional() @IsDateString()         fechaValidez?:      string;
  @IsOptional() @IsInt() @Min(0)        tiempoEntregaDias?: number;
  @IsOptional() @IsString()             condicionesPago?:   string;
  @IsOptional() @IsString()             notas?:             string;
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true })
  @Type(() => LineaCotizacionDto)
  lineas!: LineaCotizacionDto[];
}

class RespuestaCotizacionDto {
  @IsOptional() @IsDateString()         fechaRespuesta?:    string;
  @IsOptional() @IsInt() @Min(0)        tiempoEntregaDias?: number;
  @IsOptional() @IsString()             condicionesPago?:   string;
  @IsOptional() @IsString()             notas?:             string;
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true })
  @Type(() => LineaCotizacionDto)
  lineas!: LineaCotizacionDto[];
}

@ApiTags('Compras Avanzadas')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('solicitudes-compra')
export class SolicitudesCompraController {
  constructor(private svc: SolicitudesCompraService) {}

  // ── Solicitudes de Compra ─────────────────────────────────────────────────

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Crear solicitud de compra interna' })
  crear(@Body() dto: CreateSolicitudDto, @GetUser() user: User) {
    return this.svc.crearSolicitud(dto, user.id);
  }

  @Get()
  @ApiOperation({ summary: 'Listar solicitudes de compra con filtros' })
  @ApiQuery({ name: 'estado',    required: false })
  @ApiQuery({ name: 'prioridad', required: false })
  @ApiQuery({ name: 'search',    required: false })
  @ApiQuery({ name: 'page',      required: false })
  listar(
    @Query('page')      page?:      string,
    @Query('limit')     limit?:     string,
    @Query('estado')    estado?:    string,
    @Query('prioridad') prioridad?: string,
    @Query('search')    search?:    string,
  ) {
    return this.svc.getSolicitudes({
      page:      page  ? Number(page)  : 1,
      limit:     limit ? Number(limit) : 15,
      estado, prioridad, search,
    });
  }

  @Get('resumen')
  @ApiOperation({ summary: 'Conteo de solicitudes por estado' })
  resumen() {
    return this.svc.getResumenSolicitudes();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de solicitud de compra' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.svc.findSolicitudById(id);
  }

  @Patch(':id/estado')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Cambiar estado (enviar, aprobar, rechazar, cancelar)' })
  cambiarEstado(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CambiarEstadoSolicitudDto,
    @GetUser() user: User,
  ) {
    return this.svc.cambiarEstadoSolicitud(id, dto.estado, user.id, dto.comentario);
  }

  // ── Cotizaciones a Proveedores (RFQ) ──────────────────────────────────────

  @Post('cotizaciones')
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Crear solicitud de cotización (RFQ) a un proveedor' })
  crearCotizacion(@Body() dto: CreateCotizacionDto) {
    return this.svc.crearCotizacion(dto);
  }

  @Get('cotizaciones/lista')
  @ApiOperation({ summary: 'Listar cotizaciones. Filtrar por solicitudId, estado' })
  @ApiQuery({ name: 'solicitudId', required: false })
  @ApiQuery({ name: 'estado',      required: false })
  listarCotizaciones(
    @Query('solicitudId') solicitudId?: string,
    @Query('estado')      estado?:      string,
    @Query('page')        page?:        string,
  ) {
    return this.svc.getCotizaciones({
      solicitudId: solicitudId ? Number(solicitudId) : undefined,
      estado,
      page: page ? Number(page) : 1,
    });
  }

  @Get('cotizaciones/:id')
  @ApiOperation({ summary: 'Detalle de cotización a proveedor' })
  findCotizacion(@Param('id', ParseIntPipe) id: number) {
    return this.svc.findCotizacionById(id);
  }

  @Patch('cotizaciones/:id/respuesta')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Registrar respuesta del proveedor (precios, tiempo entrega)' })
  registrarRespuesta(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RespuestaCotizacionDto,
  ) {
    return this.svc.registrarRespuestaCotizacion(id, dto);
  }

  @Patch('cotizaciones/:id/seleccionar')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Seleccionar cotización ganadora — rechaza las demás automáticamente' })
  seleccionarCotizacion(@Param('id', ParseIntPipe) id: number) {
    return this.svc.seleccionarCotizacion(id);
  }

  // ── Comparativo ───────────────────────────────────────────────────────────

  @Get(':solicitudId/comparativo')
  @ApiOperation({ summary: 'Comparativo de propuestas de todos los proveedores para una solicitud' })
  getComparativo(@Param('solicitudId', ParseIntPipe) solicitudId: number) {
    return this.svc.getComparativo(solicitudId);
  }
}
