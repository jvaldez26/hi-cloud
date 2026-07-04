import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query,
  ParseIntPipe, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiHeader } from '@nestjs/swagger';
import {
  IsString, IsOptional, IsInt, IsPositive, IsNumber, IsArray,
  ValidateNested, Min, IsDateString,
} from 'class-validator';
import { Type } from 'class-transformer';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { User } from '../users/users.entity';
import { PaginationDto } from '../common/dto/pagination.dto';
import { ConduceService } from './conduce.service';
import { EstadoConduce } from './entities/conduce.entity';

class DetalleConduceDto {
  @IsOptional() @IsInt() @IsPositive() @Type(() => Number) productoId?: number;
  @IsString()                                               descripcion!: string;
  @IsOptional() @IsString()                                 unidadMedida?: string;
  @IsNumber() @Min(0.0001) @Type(() => Number)              cantidad!: number;
  @IsOptional() @IsString()                                 observaciones?: string;
}

class CreateConduceDto {
  @IsInt() @IsPositive() @Type(() => Number)        clienteId!: number;
  @IsDateString()                                    fecha!: string;
  @IsOptional() @IsDateString()                      fechaEntregaProgramada?: string;
  @IsOptional() @IsInt() @Type(() => Number)         facturaId?: number;
  @IsOptional() @IsInt() @Type(() => Number)         preFacturaId?: number;
  @IsString()                                        direccionEntrega!: string;
  @IsOptional() @IsString()                          ciudad?: string;
  @IsOptional() @IsString()                          contactoEntrega?: string;
  @IsOptional() @IsString()                          telefonoContacto?: string;
  @IsOptional() @IsString()                          conductor?: string;
  @IsOptional() @IsString()                          vehiculo?: string;
  @IsOptional() @IsString()                          notas?: string;
  @IsOptional() @IsInt() @Type(() => Number)         sucursalId?: number;
  @IsArray() @ValidateNested({ each: true }) @Type(() => DetalleConduceDto)
  detalles!: DetalleConduceDto[];
}

class EntregaDto {
  @IsOptional() @IsString() observaciones?: string;
}

@ApiTags('Conduces')
@ApiBearerAuth('access-token')
@ApiHeader({ name: 'X-Empresa-ID', description: 'ID de la empresa activa', required: true })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR)
@Controller('conduces')
export class ConduceController {
  constructor(private readonly svc: ConduceService) {}

  @Get('resumen')
  @ApiOperation({ summary: 'Conteo por estado de conduces' })
  resumen() { return this.svc.resumen(); }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR, UserRole.VIEWER)
  @ApiOperation({ summary: 'Listar conduces con paginación y filtro por estado' })
  listar(
    @Query() pagination: PaginationDto,
    @Query('estado') estado?: EstadoConduce,
  ) {
    return this.svc.listar(pagination, estado);
  }

  @Get('factura/:facturaId/pendientes')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR, UserRole.VIEWER)
  @ApiOperation({ summary: 'Cantidades pendientes de despacho por factura' })
  pendientesPorFactura(@Param('facturaId', ParseIntPipe) facturaId: number) {
    return this.svc.getPendientesPorFactura(facturaId);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR, UserRole.VIEWER)
  @ApiOperation({ summary: 'Detalle de un conduce' })
  findOne(@Param('id', ParseIntPipe) id: number) { return this.svc.findOne(id); }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Crear nuevo conduce' })
  crear(@Body() dto: CreateConduceDto, @GetUser() user: User) {
    return this.svc.crear(dto, user.id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar conduce' })
  actualizar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: Partial<CreateConduceDto>,
  ) {
    return this.svc.actualizar(id, dto);
  }

  @Patch(':id/en-transito')
  @ApiOperation({ summary: 'Marcar conduce como En Tránsito' })
  enTransito(@Param('id', ParseIntPipe) id: number) {
    return this.svc.marcarEnTransito(id);
  }

  @Patch(':id/entregado')
  @ApiOperation({ summary: 'Confirmar entrega del conduce' })
  entregado(@Param('id', ParseIntPipe) id: number, @Body() dto: EntregaDto) {
    return this.svc.marcarEntregado(id, dto.observaciones);
  }

  @Patch(':id/devuelto')
  @ApiOperation({ summary: 'Registrar devolución del conduce' })
  devuelto(@Param('id', ParseIntPipe) id: number, @Body() dto: EntregaDto) {
    return this.svc.marcarDevuelto(id, dto.observaciones);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar conduce (no entregados)' })
  eliminar(@Param('id', ParseIntPipe) id: number) { return this.svc.eliminar(id); }
}
