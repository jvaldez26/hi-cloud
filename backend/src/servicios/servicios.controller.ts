import {
  Controller, Get, Post, Patch, Body, Param, Query,
  ParseIntPipe, HttpCode, HttpStatus, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import {
  IsString, IsInt, IsPositive, IsOptional, IsEnum,
  IsNumber, IsArray, ValidateNested, IsDateString,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ServiciosService } from './servicios.service';
import { EstadoOrden } from './entities/orden-servicio.entity';
import { PaginationDto } from '../common/dto/pagination.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { User } from '../users/users.entity';

class DetalleOrdenDto {
  @IsOptional() @IsInt()                            productoId?: number;
  @IsString()                                       descripcion: string;
  @IsNumber({ maxDecimalPlaces: 2 }) @IsPositive()  cantidad: number;
  @IsNumber({ maxDecimalPlaces: 2 }) @IsPositive()  precioUnitario: number;
  @IsOptional() @IsString()                         tipo?: string;
}

class CreateOrdenDto {
  @IsInt() @IsPositive()   clienteId: number;
  @IsString()              descripcionEquipo: string;
  @IsString()              descripcionProblema: string;
  @IsOptional() @IsString() diagnostico?: string;
  @IsOptional() @IsInt()   tecnicoId?: number;
  @IsOptional() @IsDateString() fechaPromesa?: string;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) presupuesto?: number;
  @IsOptional() @IsString() notas?: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => DetalleOrdenDto)
  detalles?: DetalleOrdenDto[];
}

class CambiarEstadoDto {
  @IsEnum(EstadoOrden)       estado: EstadoOrden;
  @IsOptional() @IsString()  notas?: string;
}

class DiagnosticoDto {
  @IsString()                                           diagnostico: string;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @IsPositive() presupuesto?: number;
}

@ApiTags('Órdenes de Servicio')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('servicios')
export class ServiciosController {
  constructor(private svc: ServiciosService) {}

  @Get('resumen')
  @ApiOperation({ summary: 'Resumen de órdenes por estado' })
  getResumen() {
    return this.svc.getResumen();
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR)
  @ApiOperation({ summary: 'Crear nueva orden de servicio' })
  crear(@Body() dto: CreateOrdenDto, @GetUser() usuario: User) {
    return this.svc.crear(dto, usuario);
  }

  @Get()
  @ApiOperation({ summary: 'Listar órdenes de servicio' })
  findAll(
    @Query() pagination: PaginationDto,
    @Query('estado') estado?: EstadoOrden,
  ) {
    return this.svc.findAll(pagination, estado);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de una orden de servicio' })
  findById(@Param('id', ParseIntPipe) id: number) {
    return this.svc.findById(id);
  }

  @Patch(':id/estado')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR)
  @ApiOperation({ summary: 'Cambiar estado de la orden (sigue el flujo predefinido)' })
  cambiarEstado(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CambiarEstadoDto,
  ) {
    return this.svc.cambiarEstado(id, dto.estado, dto.notas);
  }

  @Patch(':id/diagnostico')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR)
  @ApiOperation({ summary: 'Registrar diagnóstico y presupuesto' })
  diagnostico(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: DiagnosticoDto,
  ) {
    return this.svc.actualizarDiagnostico(id, dto.diagnostico, dto.presupuesto);
  }

  @Post(':id/detalles')
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR)
  @ApiOperation({ summary: 'Agregar pieza o mano de obra a la orden' })
  agregarDetalle(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: DetalleOrdenDto,
  ) {
    return this.svc.agregarDetalle(id, dto);
  }

  @Post(':id/facturar')
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR)
  @ApiOperation({ summary: '🔄 Convertir orden a factura (BORRADOR) — piezas + mano de obra' })
  facturar(
    @Param('id', ParseIntPipe) id: number,
    @GetUser() usuario: User,
  ) {
    return this.svc.convertirAFactura(id, usuario);
  }
}
