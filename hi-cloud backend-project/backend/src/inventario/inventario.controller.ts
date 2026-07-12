import {
  Controller, Get, Post, Patch, Body, Param, Query,
  ParseIntPipe, HttpCode, HttpStatus, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import {
  IsString, IsOptional, IsNumber, IsInt, IsPositive,
  Min, IsDateString, IsArray, IsEnum, ArrayMinSize, IsBoolean,
} from 'class-validator';
import { InventarioService } from './inventario.service';
import { RegistrarEntradaDto } from './dto/registrar-entrada.dto';
import { RegistrarSalidaDto } from './dto/registrar-salida.dto';
import { RegistrarAjusteDto } from './dto/registrar-ajuste.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { EstadoLote } from './entities/lote-producto.entity';
import { EstadoSerial } from './entities/serial-producto.entity';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { User } from '../users/users.entity';

class MovimientosFilterDto extends PaginationDto {
  @IsOptional() @IsString() tipo?:   string;
  @IsOptional() @IsString() desde?:  string;
  @IsOptional() @IsString() hasta?:  string;
}

class CreateLoteDto {
  @IsInt() @IsPositive()             productoId!:        number;
  @IsString()                        numeroLote!:        string;
  @IsNumber() @Min(0)                cantidad!:          number;
  @IsOptional() @IsDateString()      fechaVencimiento?:  string;
  @IsOptional() @IsDateString()      fechaFabricacion?:  string;
  @IsOptional() @IsNumber() @Min(0)  costoUnitario?:     number;
  @IsOptional() @IsInt()             almacenId?:         number;
  @IsOptional() @IsString()          proveedor?:         string;
  @IsOptional() @IsString()          referencia?:        string;
  @IsOptional() @IsString()          notas?:             string;
}

class UpdateLoteDto {
  @IsOptional() @IsEnum(EstadoLote)  estado?:             EstadoLote;
  @IsOptional() @IsNumber() @Min(0)  cantidadDisponible?: number;
  @IsOptional() @IsString()          notas?:              string;
}

class RegistrarSerialesDto {
  @IsInt() @IsPositive()             productoId!:              number;
  @IsArray() @ArrayMinSize(1) @IsString({ each: true }) numeros!: string[];
  @IsOptional() @IsInt()             loteId?:                  number;
  @IsOptional() @IsNumber() @Min(0)  costoUnitario?:           number;
  @IsOptional() @IsDateString()      fechaVencimientoGarantia?: string;
  @IsOptional() @IsString()          notas?:                   string;
}

class UpdateSerialDto {
  @IsEnum(EstadoSerial)              estado!:      EstadoSerial;
  @IsOptional() @IsInt()             facturaId?:   number;
  @IsOptional() @IsInt()             clienteId?:   number;
  @IsOptional() @IsDateString()      fechaVenta?:  string;
  @IsOptional() @IsString()          notas?:       string;
}

@ApiTags('Inventario')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('inventario')
export class InventarioController {
  constructor(private inventarioService: InventarioService) {}

  // ── Movimientos básicos ────────────────────────────────────────────────────

  @Post('entrada')
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR)
  @ApiOperation({ summary: 'Registrar entrada de mercancía al inventario' })
  registrarEntrada(@Body() dto: RegistrarEntradaDto, @GetUser() usuario: User) {
    return this.inventarioService.registrarEntradaDesdeDto(dto, usuario.id);
  }

  @Post('salida')
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR)
  @ApiOperation({ summary: 'Registrar salida de mercancía del inventario' })
  registrarSalida(@Body() dto: RegistrarSalidaDto, @GetUser() usuario: User) {
    return this.inventarioService.registrarSalidaDesdeDto(dto, usuario.id);
  }

  @Post('ajuste')
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Ajuste manual de inventario (solo ADMIN)' })
  registrarAjuste(@Body() dto: RegistrarAjusteDto, @GetUser() usuario: User) {
    return this.inventarioService.registrarAjusteDesdeDto(dto, usuario.id);
  }

  @Get('movimientos')
  @ApiOperation({ summary: 'Historial de movimientos con filtros' })
  getMovimientos(@Query() pagination: MovimientosFilterDto) {
    return this.inventarioService.getMovimientos(pagination);
  }

  @Get('movimientos/:productoId')
  @ApiOperation({ summary: 'Movimientos de un producto específico' })
  getMovimientosPorProducto(
    @Param('productoId', ParseIntPipe) productoId: number,
    @Query() pagination: PaginationDto,
  ) {
    return this.inventarioService.getMovimientosPorProducto(productoId, pagination);
  }

  @Get('stock-bajo')
  @ApiOperation({ summary: 'Productos con stock igual o menor al stock mínimo' })
  getStockBajo() {
    return this.inventarioService.getStockBajo();
  }

  // ── Lotes / Batches ────────────────────────────────────────────────────────

  @Post('lotes')
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Registrar lote/batch de un producto con fecha de vencimiento' })
  crearLote(@Body() dto: CreateLoteDto) {
    return this.inventarioService.crearLote(dto);
  }

  @Get('lotes')
  @ApiOperation({ summary: 'Listar lotes. Filtrar por producto, estado, solo vigentes' })
  @ApiQuery({ name: 'productoId',    required: false })
  @ApiQuery({ name: 'estado',        required: false })
  @ApiQuery({ name: 'soloVigentes',  required: false, type: Boolean })
  getLotes(
    @Query('productoId')   productoId?:  string,
    @Query('estado')       estado?:      string,
    @Query('soloVigentes') soloVigentes?: string,
  ) {
    return this.inventarioService.getLotes(
      productoId  ? Number(productoId) : undefined,
      estado,
      soloVigentes === 'true',
    );
  }

  @Get('lotes/alertas')
  @ApiOperation({ summary: 'Lotes vencidos y próximos a vencer (≤30 días)' })
  getAlertasLotes() {
    return this.inventarioService.getAlertasLotes();
  }

  @Patch('lotes/:id')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Actualizar estado o cantidad disponible de un lote' })
  updateLote(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateLoteDto) {
    return this.inventarioService.updateLote(id, dto);
  }

  // ── Seriales ───────────────────────────────────────────────────────────────

  @Post('seriales')
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Registrar uno o varios números de serie para un producto' })
  registrarSeriales(@Body() dto: RegistrarSerialesDto) {
    return this.inventarioService.registrarSeriales(dto);
  }

  @Get('seriales')
  @ApiOperation({ summary: 'Listar seriales. Filtrar por producto, estado o búsqueda' })
  @ApiQuery({ name: 'productoId', required: false })
  @ApiQuery({ name: 'estado',     required: false })
  @ApiQuery({ name: 'search',     required: false })
  getSeriales(
    @Query('productoId') productoId?: string,
    @Query('estado')     estado?:     string,
    @Query('search')     search?:     string,
  ) {
    return this.inventarioService.getSeriales(
      productoId ? Number(productoId) : undefined,
      estado,
      search,
    );
  }

  @Get('seriales/resumen')
  @ApiOperation({ summary: 'Conteo de seriales por estado' })
  @ApiQuery({ name: 'productoId', required: false })
  getResumenSeriales(@Query('productoId') productoId?: string) {
    return this.inventarioService.getResumenSeriales(productoId ? Number(productoId) : undefined);
  }

  @Get('seriales/buscar/:numero')
  @ApiOperation({ summary: 'Buscar serial por número de serie exacto' })
  buscarSerial(@Param('numero') numero: string) {
    return this.inventarioService.buscarSerial(numero);
  }

  @Patch('seriales/:id/estado')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Cambiar estado de un serial (vendido, devuelto, defectuoso...)' })
  actualizarEstadoSerial(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSerialDto,
  ) {
    return this.inventarioService.actualizarEstadoSerial(id, dto);
  }

  // ── Solicitudes de Ajuste ──────────────────────────────────────────────────

  @Post('solicitudes-ajuste')
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Solicitar ajuste de inventario (requiere aprobación de ADMIN)' })
  createSolicitudAjuste(
    @Body() dto: RegistrarAjusteDto,
    @GetUser() usuario: User,
  ) {
    return this.inventarioService.createSolicitudAjuste(dto, usuario.id);
  }

  @Get('solicitudes-ajuste')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Listar solicitudes de ajuste. Filtrar por estado (?estado=pendiente)' })
  @ApiQuery({ name: 'estado', required: false, example: 'pendiente' })
  getSolicitudesAjuste(@Query('estado') estado?: string) {
    return this.inventarioService.getSolicitudesAjuste(estado);
  }

  @Patch('solicitudes-ajuste/:id/aprobar')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Aprobar solicitud de ajuste y aplicar el cambio de stock (solo ADMIN)' })
  aprobarSolicitudAjuste(
    @Param('id', ParseIntPipe) id: number,
    @GetUser() usuario: User,
  ) {
    return this.inventarioService.aprobarSolicitudAjuste(id, usuario.id);
  }

  @Patch('solicitudes-ajuste/:id/rechazar')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Rechazar solicitud de ajuste (solo ADMIN)' })
  rechazarSolicitudAjuste(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: { motivoRechazo: string },
    @GetUser() usuario: User,
  ) {
    return this.inventarioService.rechazarSolicitudAjuste(id, usuario.id, dto.motivoRechazo ?? '');
  }
}
