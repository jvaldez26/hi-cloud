import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query,
  ParseIntPipe, HttpCode, HttpStatus, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import {
  IsString, IsOptional, IsEnum, IsNumber, IsInt, IsArray,
  IsPositive, Min, ValidateNested, IsDateString,
} from 'class-validator';
import { Type } from 'class-transformer';
import { WmsService } from './wms.service';
import { TipoUbicacion } from './entities/ubicacion-almacen.entity';
import { EstadoPicking, TipoOrdenPicking } from './entities/orden-picking.entity';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { User } from '../users/users.entity';

class CreateUbicacionDto {
  @IsInt() @IsPositive()              almacenId!:    number;
  @IsString()                         codigo!:       string;
  @IsOptional() @IsEnum(TipoUbicacion) tipo?:        TipoUbicacion;
  @IsOptional() @IsString()           pasillo?:      string;
  @IsOptional() @IsString()           estante?:      string;
  @IsOptional() @IsString()           nivel?:        string;
  @IsOptional() @IsString()           posicion?:     string;
  @IsOptional() @IsNumber() @Min(0)   capacidadKg?:  number;
  @IsOptional() @IsString()           notas?:        string;
}

class LineaPickingDto {
  @IsInt() @IsPositive()               productoId!:          number;
  @IsNumber() @Min(0.001)              cantidadSolicitada!:  number;
  @IsOptional() @IsInt() @IsPositive() ubicacionId?:         number;
  @IsOptional() @IsInt() @IsPositive() loteId?:              number;
  @IsOptional() @IsString()            numeroSerie?:         string;
}

class CreateOrdenDto {
  @IsInt() @IsPositive()                almacenId!:         number;
  @IsOptional() @IsEnum(TipoOrdenPicking) tipo?:            TipoOrdenPicking;
  @IsOptional() @IsInt() @IsPositive()  facturaId?:         number;
  @IsOptional() @IsInt() @IsPositive()  transferId?:        number;
  @IsOptional() @IsInt()                prioridad?:         number;
  @IsOptional() @IsString()             destinatario?:      string;
  @IsOptional() @IsString()             direccionEntrega?:  string;
  @IsOptional() @IsString()             observaciones?:     string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => LineaPickingDto)
  lineas!: LineaPickingDto[];
}

class PickearLineaDto {
  @IsNumber() @Min(0)         cantidadPickeada!: number;
  @IsOptional() @IsString()   notas?:            string;
}

class AsignarDto {
  @IsInt() @IsPositive()  operadorId!: number;
}

class DespacharDto {
  @IsOptional() @IsString()  observaciones?: string;
}

@ApiTags('WMS — Gestión de Almacenes')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('wms')
export class WmsController {
  constructor(private svc: WmsService) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Dashboard WMS — KPIs de picking, cola operadores, urgentes' })
  getDashboard() { return this.svc.getDashboard(); }

  // ── Ubicaciones ───────────────────────────────────────────────────────────

  @Post('ubicaciones')
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Crear ubicación física en almacén (pasillo-estante-nivel-posición)' })
  crearUbicacion(@Body() dto: CreateUbicacionDto) { return this.svc.crearUbicacion(dto); }

  @Get('ubicaciones')
  @ApiOperation({ summary: 'Listar ubicaciones de almacén' })
  @ApiQuery({ name: 'almacenId', required: false })
  @ApiQuery({ name: 'tipo',      required: false })
  getUbicaciones(
    @Query('almacenId') almacenId?: string,
    @Query('tipo')      tipo?:      TipoUbicacion,
  ) { return this.svc.getUbicaciones(almacenId ? Number(almacenId) : undefined, tipo); }

  @Patch('ubicaciones/:id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Actualizar ubicación' })
  updateUbicacion(@Param('id', ParseIntPipe) id: number, @Body() dto: CreateUbicacionDto) {
    return this.svc.updateUbicacion(id, dto as any);
  }

  @Delete('ubicaciones/:id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Eliminar ubicación' })
  deleteUbicacion(@Param('id', ParseIntPipe) id: number) { return this.svc.deleteUbicacion(id); }

  // ── Órdenes de Picking ────────────────────────────────────────────────────

  @Post('ordenes')
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR)
  @ApiOperation({ summary: 'Crear orden de picking' })
  crearOrden(@Body() dto: CreateOrdenDto, @GetUser() user: User) {
    return this.svc.crearOrden({ ...dto, creadoPorId: user.id });
  }

  @Get('ordenes')
  @ApiOperation({ summary: 'Listar órdenes de picking con filtros' })
  @ApiQuery({ name: 'estado',      required: false })
  @ApiQuery({ name: 'almacenId',   required: false })
  @ApiQuery({ name: 'operadorId',  required: false })
  @ApiQuery({ name: 'page',        required: false })
  getOrdenes(
    @Query('estado')     estado?:     EstadoPicking,
    @Query('almacenId')  almacenId?:  string,
    @Query('operadorId') operadorId?: string,
    @Query('page')       page?:       string,
  ) {
    return this.svc.getOrdenes({
      estado,
      almacenId:  almacenId  ? Number(almacenId)  : undefined,
      operadorId: operadorId ? Number(operadorId) : undefined,
      page:       page       ? Number(page)       : 1,
    });
  }

  @Get('ordenes/:id')
  @ApiOperation({ summary: 'Detalle de orden de picking con líneas' })
  findOrden(@Param('id', ParseIntPipe) id: number) { return this.svc.findOrdenById(id); }

  @Post('ordenes/:id/asignar')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Asignar operador a la orden (BORRADOR → ASIGNADA)' })
  asignarOperador(@Param('id', ParseIntPipe) id: number, @Body() dto: AsignarDto) {
    return this.svc.asignarOperador(id, dto.operadorId);
  }

  @Patch('ordenes/:id/iniciar')
  @ApiOperation({ summary: 'El operador inicia el picking (ASIGNADA → EN_PROCESO)' })
  iniciarPicking(@Param('id', ParseIntPipe) id: number) { return this.svc.iniciarPicking(id); }

  @Patch('ordenes/:id/despachar')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR)
  @ApiOperation({ summary: 'Despachar orden empacada (EMPACADA → DESPACHADA)' })
  despachar(@Param('id', ParseIntPipe) id: number, @Body() dto: DespacharDto) {
    return this.svc.despacharOrden(id, dto);
  }

  @Patch('ordenes/:id/cancelar')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Cancelar orden de picking' })
  cancelar(@Param('id', ParseIntPipe) id: number) { return this.svc.cancelarOrden(id); }

  @Get('ordenes/:id/ruta')
  @ApiOperation({ summary: 'Generar ruta de recogida optimizada por ubicación' })
  getRuta(@Param('id', ParseIntPipe) id: number) { return this.svc.generarRutaRecogida(id); }

  // ── Líneas de picking ─────────────────────────────────────────────────────

  @Patch('lineas/:id/pickear')
  @ApiOperation({ summary: 'Registrar cantidad pickeada de una línea' })
  pickearLinea(@Param('id', ParseIntPipe) id: number, @Body() dto: PickearLineaDto) {
    return this.svc.pickearLinea(id, dto);
  }
}
