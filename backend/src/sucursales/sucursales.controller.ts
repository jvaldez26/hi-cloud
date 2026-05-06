import {
  Controller, Get, Post, Patch, Delete, Body, Param,
  ParseIntPipe, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiHeader } from '@nestjs/swagger';
import { IsString, IsOptional, IsEmail, IsBoolean, IsInt, IsPositive } from 'class-validator';
import { Type } from 'class-transformer';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { SucursalesService } from './sucursales.service';

class CreateSucursalDto {
  @IsString()
  codigo!: string;

  @IsString()
  nombre!: string;

  @IsOptional() @IsString()
  direccion?: string;

  @IsOptional() @IsString()
  ciudad?: string;

  @IsOptional() @IsString()
  telefono?: string;

  @IsOptional() @IsEmail()
  email?: string;

  @IsOptional() @IsBoolean()
  esPrincipal?: boolean;

  @IsOptional() @IsInt() @IsPositive() @Type(() => Number)
  responsableId?: number;

  @IsOptional() @IsString()
  notas?: string;
}

@ApiTags('Sucursales')
@ApiBearerAuth('access-token')
@ApiHeader({ name: 'X-Empresa-ID', description: 'ID de la empresa activa', required: true })
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('sucursales')
export class SucursalesController {
  constructor(private readonly svc: SucursalesService) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR, UserRole.VIEWER)
  @ApiOperation({ summary: 'Listar todas las sucursales de la empresa' })
  listar() { return this.svc.listar(); }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR, UserRole.VIEWER)
  @ApiOperation({ summary: 'Detalle de una sucursal' })
  findOne(@Param('id', ParseIntPipe) id: number) { return this.svc.findOne(id); }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Crear sucursal (solo ADMIN)' })
  crear(@Body() dto: CreateSucursalDto) { return this.svc.crear(dto); }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Actualizar sucursal' })
  actualizar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: Partial<CreateSucursalDto>,
  ) {
    return this.svc.actualizar(id, dto);
  }

  @Patch(':id/principal')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Designar como sucursal principal' })
  setPrincipal(@Param('id', ParseIntPipe) id: number) {
    return this.svc.setPrincipal(id);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Eliminar sucursal (no puede ser la principal)' })
  eliminar(@Param('id', ParseIntPipe) id: number) {
    return this.svc.eliminar(id);
  }
}
