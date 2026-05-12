import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query,
  ParseIntPipe, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiHeader } from '@nestjs/swagger';
import {
  IsString, IsOptional, IsInt, IsPositive, IsNumber, IsEmail,
  Min, Max, IsDateString,
} from 'class-validator';
import { Type } from 'class-transformer';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { VendedoresService } from './vendedores.service';

class CreateVendedorDto {
  @IsString()                                            nombre!: string;
  @IsOptional() @IsString()                              cedula?: string;
  @IsOptional() @IsEmail()                               email?: string;
  @IsOptional() @IsString()                              telefono?: string;
  @IsOptional() @IsString()                              zona?: string;
  @IsOptional() @IsString()                              cargo?: string;
  @IsOptional() @IsNumber() @Min(0) @Max(100) @Type(() => Number) comisionPct?: number;
  @IsOptional() @IsNumber() @Min(0) @Type(() => Number)  metaMensual?: number;
  @IsOptional() @IsInt() @IsPositive() @Type(() => Number) usuarioId?: number;
  @IsOptional() @IsDateString()                          fechaIngreso?: string;
  @IsOptional() @IsString()                              notas?: string;
}

class AsignarClienteDto {
  @IsInt() @IsPositive() @Type(() => Number)             clienteId!: number;
}

@ApiTags('Vendedores')
@ApiBearerAuth('access-token')
@ApiHeader({ name: 'X-Empresa-ID', description: 'ID de la empresa activa', required: true })
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('vendedores')
export class VendedoresController {
  constructor(private readonly svc: VendedoresService) {}

  @Get('resumen')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR, UserRole.VIEWER)
  resumen() { return this.svc.resumen(); }

  @Get('ranking')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR, UserRole.VIEWER)
  @ApiOperation({ summary: 'Ranking de vendedores por ventas del mes' })
  ranking(
    @Query('mes')  mes?: string,
    @Query('anio') anio?: string,
  ) {
    const hoy = new Date();
    return this.svc.getRanking(
      mes  ? Number(mes)  : hoy.getMonth() + 1,
      anio ? Number(anio) : hoy.getFullYear(),
    );
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR, UserRole.VIEWER)
  listar() { return this.svc.listar(); }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR, UserRole.VIEWER)
  findOne(@Param('id', ParseIntPipe) id: number) { return this.svc.findOne(id); }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Crear vendedor' })
  crear(@Body() dto: CreateVendedorDto) { return this.svc.crear(dto); }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  actualizar(@Param('id', ParseIntPipe) id: number, @Body() dto: Partial<CreateVendedorDto>) {
    return this.svc.actualizar(id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  eliminar(@Param('id', ParseIntPipe) id: number) { return this.svc.eliminar(id); }

  @Get(':id/rendimiento')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR, UserRole.VIEWER)
  @ApiOperation({ summary: 'Rendimiento de un vendedor en un período' })
  rendimiento(
    @Param('id', ParseIntPipe) id: number,
    @Query('mes')  mes?: string,
    @Query('anio') anio?: string,
  ) {
    const hoy = new Date();
    return this.svc.getRendimiento(
      id,
      mes  ? Number(mes)  : hoy.getMonth() + 1,
      anio ? Number(anio) : hoy.getFullYear(),
    );
  }

  @Get(':id/historial')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR, UserRole.VIEWER)
  @ApiOperation({ summary: 'Historial de ventas de los últimos 12 meses' })
  historial(@Param('id', ParseIntPipe) id: number) { return this.svc.getHistorial(id); }

  @Get(':id/clientes')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR, UserRole.VIEWER)
  @ApiOperation({ summary: 'Clientes asignados al vendedor' })
  getClientes(@Param('id', ParseIntPipe) id: number) { return this.svc.getClientes(id); }

  @Post(':id/clientes')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Asignar cliente al vendedor' })
  asignarCliente(@Param('id', ParseIntPipe) id: number, @Body() dto: AsignarClienteDto) {
    return this.svc.asignarCliente(id, dto.clienteId);
  }

  @Delete(':id/clientes/:clienteId')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Desasignar cliente del vendedor' })
  desasignarCliente(
    @Param('id', ParseIntPipe)        id:        number,
    @Param('clienteId', ParseIntPipe) clienteId: number,
  ) {
    return this.svc.desasignarCliente(id, clienteId);
  }
}
