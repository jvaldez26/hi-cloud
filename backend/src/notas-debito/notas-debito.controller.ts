import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query,
  ParseIntPipe, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiHeader } from '@nestjs/swagger';
import {
  IsString, IsOptional, IsInt, IsPositive, IsNumber, IsArray,
  ValidateNested, Min, IsDateString, IsEnum,
} from 'class-validator';
import { Type } from 'class-transformer';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { User } from '../users/users.entity';
import { PaginationDto } from '../common/dto/pagination.dto';
import { NotasDebitoService } from './notas-debito.service';
import { MotivoNotaDebito } from './entities/nota-debito.entity';

class DetalleNDDto {
  @IsOptional() @IsInt() @IsPositive() @Type(() => Number) productoId?: number;
  @IsString()                                               descripcion!: string;
  @IsOptional() @IsString()                                 unidadMedida?: string;
  @IsNumber() @Min(0.0001) @Type(() => Number)              cantidad!: number;
  @IsNumber() @Min(0) @Type(() => Number)                   precioUnitario!: number;
  @IsOptional() @IsNumber() @Min(0) @Type(() => Number)     porcentajeIva?: number;
}

class CreateNDDto {
  @IsInt() @IsPositive() @Type(() => Number)                clienteId!: number;
  @IsDateString()                                            fecha!: string;
  @IsOptional() @IsInt() @Type(() => Number)                 facturaOriginalId?: number;
  @IsOptional() @IsString()                                  facturaOriginalFolio?: string;
  @IsEnum(MotivoNotaDebito)                                  motivo!: MotivoNotaDebito;
  @IsOptional() @IsString()                                  descripcionMotivo?: string;
  @IsOptional() @IsString()                                  notas?: string;
  @IsOptional() @IsInt() @Type(() => Number)                 vendedorId?: number;
  @IsOptional() @IsString()                                  nombreVendedor?: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => DetalleNDDto)
  detalles!: DetalleNDDto[];
}

@ApiTags('Notas de Débito (E33)')
@ApiBearerAuth('access-token')
@ApiHeader({ name: 'X-Empresa-ID', required: true })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR)
@Controller('notas-debito')
export class NotasDebitoController {
  constructor(private readonly svc: NotasDebitoService) {}

  @Get('resumen')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VIEWER)
  resumen() { return this.svc.resumen(); }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR, UserRole.VIEWER)
  @ApiOperation({ summary: 'Listar notas de débito con paginación' })
  listar(@Query() pagination: PaginationDto) { return this.svc.listar(pagination); }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR, UserRole.VIEWER)
  findOne(@Param('id', ParseIntPipe) id: number) { return this.svc.findOne(id); }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Crear nota de débito (e-CF E33 DGII)' })
  crear(@Body() dto: CreateNDDto, @GetUser() user: User) {
    return this.svc.crear(dto, user.id);
  }

  @Patch(':id/emitir')
  @ApiOperation({ summary: 'Emitir nota de débito' })
  emitir(@Param('id', ParseIntPipe) id: number) { return this.svc.emitir(id); }

  @Patch(':id/anular')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Anular nota de débito' })
  anular(@Param('id', ParseIntPipe) id: number) { return this.svc.anular(id); }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar nota en BORRADOR' })
  eliminar(@Param('id', ParseIntPipe) id: number) { return this.svc.eliminar(id); }
}
