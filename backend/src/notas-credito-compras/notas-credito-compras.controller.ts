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
import { NotasCreditoComprasService } from './notas-credito-compras.service';
import { MotivoNCCompra } from './entities/nota-credito-compra.entity';

class DetalleDto {
  @IsOptional() @IsInt() @IsPositive() @Type(() => Number) productoId?: number;
  @IsString()                                               descripcion!: string;
  @IsOptional() @IsString()                                 unidadMedida?: string;
  @IsNumber() @Min(0.0001) @Type(() => Number)              cantidad!: number;
  @IsNumber() @Min(0) @Type(() => Number)                   precioUnitario!: number;
  @IsOptional() @IsNumber() @Min(0) @Type(() => Number)     porcentajeIva?: number;
}

class CreateNCCDto {
  @IsInt() @IsPositive() @Type(() => Number)                proveedorId!: number;
  @IsDateString()                                            fecha!: string;
  @IsOptional() @IsInt() @Type(() => Number)                 compraOriginalId?: number;
  @IsOptional() @IsString()                                  compraOriginalFolio?: string;
  @IsEnum(MotivoNCCompra)                                    motivo!: MotivoNCCompra;
  @IsOptional() @IsString()                                  descripcionMotivo?: string;
  @IsOptional() @IsString()                                  notas?: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => DetalleDto)
  detalles!: DetalleDto[];
}

@ApiTags('Notas de Crédito de Compras')
@ApiBearerAuth('access-token')
@ApiHeader({ name: 'X-Empresa-ID', required: true })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.CONTADOR)
@Controller('notas-credito-compras')
export class NotasCreditoComprasController {
  constructor(private readonly svc: NotasCreditoComprasService) {}

  @Get('resumen')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VIEWER)
  resumen() { return this.svc.resumen(); }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VIEWER)
  listar(@Query() pagination: PaginationDto) { return this.svc.listar(pagination); }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VIEWER)
  findOne(@Param('id', ParseIntPipe) id: number) { return this.svc.findOne(id); }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Crear nota de crédito de compra (devolución a proveedor)' })
  crear(@Body() dto: CreateNCCDto, @GetUser() user: User) {
    return this.svc.crear(dto, user.id);
  }

  @Patch(':id/recibir')
  @ApiOperation({ summary: 'Confirmar recepción de NC por parte del proveedor — afecta inventario' })
  recibir(@Param('id', ParseIntPipe) id: number) { return this.svc.recibir(id); }

  @Patch(':id/anular')
  anular(@Param('id', ParseIntPipe) id: number) { return this.svc.anular(id); }

  @Delete(':id')
  eliminar(@Param('id', ParseIntPipe) id: number) { return this.svc.eliminar(id); }
}
