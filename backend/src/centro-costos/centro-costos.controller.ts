import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query,
  ParseIntPipe, HttpCode, HttpStatus, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import {
  IsString, IsOptional, IsEnum, IsNumber, IsInt, IsPositive, IsDateString, Min,
} from 'class-validator';
import { CentroCostosService } from './centro-costos.service';
import { TipoCentroCosto } from './entities/centro-costo.entity';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/enums/user-role.enum';

class CreateCCDto {
  @IsString()                               codigo!:       string;
  @IsString()                               nombre!:       string;
  @IsOptional() @IsString()                 descripcion?:  string;
  @IsOptional() @IsEnum(TipoCentroCosto)    tipo?:         TipoCentroCosto;
  @IsOptional() @IsNumber() @Min(0)         presupuesto?:  number;
  @IsOptional() @IsInt() @IsPositive()      parentId?:     number;
}

class CreateAsignacionDto {
  @IsInt() @IsPositive()                    centroCostoId!: number;
  @IsString()                               tipoDocumento!: string;
  @IsInt() @IsPositive()                    documentoId!:   number;
  @IsNumber() @Min(0)                       monto!:         number;
  @IsOptional() @IsInt() @Min(1)            porcentaje?:    number;
  @IsOptional() @IsString()                 nota?:          string;
  @IsDateString()                           fecha!:         string;
}

@ApiTags('Centro de Costos')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.CONTADOR)
@Controller('centro-costos')
export class CentroCostosController {
  constructor(private svc: CentroCostosService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  crear(@Body() dto: CreateCCDto) { return this.svc.crear(dto); }

  @Get()
  listar() { return this.svc.listar(); }

  @Get('reporte')
  @ApiOperation({ summary: 'Reporte ejecutado vs presupuesto por centro de costo' })
  getReporte(@Query('anio') anio: string) {
    return this.svc.getReporte(Number(anio ?? new Date().getFullYear()));
  }

  @Get(':id/mensual')
  getMensual(
    @Param('id', ParseIntPipe) id: number,
    @Query('anio') anio: string,
  ) { return this.svc.getReporteMensual(id, Number(anio ?? new Date().getFullYear())); }

  @Get(':id')
  findById(@Param('id', ParseIntPipe) id: number) { return this.svc.findById(id); }

  @Patch(':id')
  actualizar(@Param('id', ParseIntPipe) id: number, @Body() dto: CreateCCDto) {
    return this.svc.actualizar(id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  eliminar(@Param('id', ParseIntPipe) id: number) { return this.svc.eliminar(id); }

  // Asignaciones
  @Post('asignaciones')
  @HttpCode(HttpStatus.CREATED)
  asignar(@Body() dto: CreateAsignacionDto) { return this.svc.asignar(dto); }

  @Get(':id/asignaciones')
  listarAsignaciones(
    @Param('id', ParseIntPipe) id: number,
    @Query('anio') anio?: string,
  ) { return this.svc.listarAsignaciones(id, anio ? Number(anio) : undefined); }

  @Delete('asignaciones/:id')
  eliminarAsignacion(@Param('id', ParseIntPipe) id: number) {
    return this.svc.eliminarAsignacion(id);
  }
}
