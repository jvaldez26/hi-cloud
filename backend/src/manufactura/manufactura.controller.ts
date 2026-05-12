import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query,
  ParseIntPipe, HttpCode, HttpStatus, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import {
  IsString, IsOptional, IsEnum, IsNumber, IsInt, IsPositive,
  IsDateString, Min, IsBoolean,
} from 'class-validator';
import { ManufacturaService } from './manufactura.service';
import { EstadoOrdenProduccion } from './entities/orden-produccion.entity';
import { PaginationDto } from '../common/dto/pagination.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/enums/user-role.enum';

class CreateLMDto {
  @IsString()                         codigo!:            string;
  @IsString()                         nombre!:            string;
  @IsOptional() @IsString()           descripcion?:       string;
  @IsInt() @IsPositive()              productoFinalId!:   number;
  @IsOptional() @IsNumber() @Min(0)   rendimiento?:       number;
  @IsOptional() @IsString()           unidadRendimiento?: string;
}

class CreateComponenteDto {
  @IsInt() @IsPositive()              productoId!: number;
  @IsNumber() @Min(0)                 cantidad!:   number;
  @IsOptional() @IsString()           unidad?:     string;
  @IsOptional() @IsString()           notas?:      string;
  @IsOptional() @IsInt() @Min(0)      orden?:      number;
}

class CreateOrdenDto {
  @IsInt() @IsPositive()              listaId!:               number;
  @IsNumber() @Min(0)                 cantidadPlanificada!:   number;
  @IsDateString()                     fechaInicio!:           string;
  @IsOptional() @IsDateString()       fechaFinPlanificada?:   string;
  @IsOptional() @IsString()           notas?:                 string;
  @IsOptional() @IsInt()              responsableId?:         number;
}

class CambiarEstadoOrdenDto {
  @IsEnum(EstadoOrdenProduccion)      estado!:              EstadoOrdenProduccion;
  @IsOptional() @IsNumber() @Min(0)   cantidadProducida?:   number;
}

@ApiTags('Manufactura & Producción')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR)
@Controller('manufactura')
export class ManufacturaController {
  constructor(private svc: ManufacturaService) {}

  @Get('dashboard')
  getDashboard() { return this.svc.getDashboard(); }

  // BOM - Listas de Materiales
  @Post('lm')
  @HttpCode(HttpStatus.CREATED)
  crearLM(@Body() dto: CreateLMDto) { return this.svc.crearLM(dto); }

  @Get('lm')
  listarLM() { return this.svc.listarLM(); }

  @Get('lm/:id')
  getLM(@Param('id', ParseIntPipe) id: number) { return this.svc.getLM(id); }

  @Patch('lm/:id')
  actualizarLM(@Param('id', ParseIntPipe) id: number, @Body() dto: CreateLMDto) {
    return this.svc.actualizarLM(id, dto);
  }

  @Delete('lm/:id')
  @Roles(UserRole.ADMIN)
  eliminarLM(@Param('id', ParseIntPipe) id: number) { return this.svc.eliminarLM(id); }

  // Componentes
  @Post('lm/:id/componentes')
  @HttpCode(HttpStatus.CREATED)
  agregarComponente(@Param('id', ParseIntPipe) id: number, @Body() dto: CreateComponenteDto) {
    return this.svc.agregarComponente(id, dto);
  }

  @Patch('componentes/:id')
  actualizarComponente(@Param('id', ParseIntPipe) id: number, @Body() dto: CreateComponenteDto) {
    return this.svc.actualizarComponente(id, dto);
  }

  @Delete('componentes/:id')
  eliminarComponente(@Param('id', ParseIntPipe) id: number) {
    return this.svc.eliminarComponente(id);
  }

  // Órdenes de producción
  @Post('ordenes')
  @HttpCode(HttpStatus.CREATED)
  crearOrden(@Body() dto: CreateOrdenDto) { return this.svc.crearOrden(dto); }

  @Get('ordenes')
  listarOrdenes(
    @Query() pagination: PaginationDto,
    @Query('estado') estado?: EstadoOrdenProduccion,
  ) { return this.svc.listarOrdenes(pagination, estado); }

  @Get('ordenes/:id')
  getOrden(@Param('id', ParseIntPipe) id: number) { return this.svc.getOrden(id); }

  @Patch('ordenes/:id/estado')
  cambiarEstado(@Param('id', ParseIntPipe) id: number, @Body() dto: CambiarEstadoOrdenDto) {
    return this.svc.cambiarEstado(id, dto.estado, dto.cantidadProducida);
  }

  @Delete('ordenes/:id')
  @Roles(UserRole.ADMIN)
  eliminarOrden(@Param('id', ParseIntPipe) id: number) { return this.svc.eliminarOrden(id); }
}
