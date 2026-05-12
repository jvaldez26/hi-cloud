import {
  Controller, Get, Post, Patch, Delete, Body, Param,
  ParseIntPipe, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiHeader } from '@nestjs/swagger';
import {
  IsString, IsOptional, IsEnum, IsNumber, IsBoolean, IsInt,
  Min, Max, IsPositive, IsDateString, IsArray, ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { DescuentosService } from './descuentos.service';
import { TipoDescuento, CondicionDescuento } from './entities/regla-descuento.entity';

class CreateReglaDto {
  @IsString()                                                     nombre!: string;
  @IsEnum(TipoDescuento)                                         tipo!: TipoDescuento;
  @IsNumber() @Min(0) @Max(100) @Type(() => Number)              valor!: number;
  @IsOptional() @IsEnum(CondicionDescuento)                      condicion?: CondicionDescuento;
  @IsOptional() @IsString()                                      condicionValor?: string;
  @IsOptional() @IsDateString()                                  fechaDesde?: string;
  @IsOptional() @IsDateString()                                  fechaHasta?: string;
  @IsOptional() @IsInt() @IsPositive() @Type(() => Number)       prioridad?: number;
  @IsOptional() @IsBoolean()                                     activo?: boolean;
  @IsOptional() @IsString()                                      descripcion?: string;
}

class ItemCalculo {
  @IsInt() @IsPositive() @Type(() => Number)                     productoId!: number;
  @IsOptional() @IsString()                                      categoria?: string;
  @IsNumber() @Min(0.01) @Type(() => Number)                     cantidad!: number;
  @IsNumber() @Min(0) @Type(() => Number)                        precioUnitario!: number;
  @IsNumber() @Min(0) @Type(() => Number)                        subtotalLinea!: number;
}

class CalcularDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => ItemCalculo)
  items!: ItemCalculo[];
}

@ApiTags('Descuentos Automatizados')
@ApiBearerAuth('access-token')
@ApiHeader({ name: 'X-Empresa-ID', required: true })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.CONTADOR)
@Controller('descuentos')
export class DescuentosController {
  constructor(private readonly svc: DescuentosService) {}

  @Get('resumen')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR, UserRole.VIEWER)
  resumen() { return this.svc.resumen(); }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR, UserRole.VIEWER)
  @ApiOperation({ summary: 'Listar todas las reglas de descuento' })
  listar() { return this.svc.listar(); }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Crear regla de descuento automático' })
  crear(@Body() dto: CreateReglaDto) { return this.svc.crear(dto as any); }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar regla de descuento' })
  actualizar(@Param('id', ParseIntPipe) id: number, @Body() dto: Partial<CreateReglaDto>) {
    return this.svc.actualizar(id, dto as any);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar regla de descuento' })
  eliminar(@Param('id', ParseIntPipe) id: number) { return this.svc.eliminar(id); }

  @Post('calcular')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR)
  @ApiOperation({ summary: 'Calcular descuentos aplicables para un conjunto de líneas de venta' })
  calcular(@Body() dto: CalcularDto) { return this.svc.calcular(dto.items); }
}
