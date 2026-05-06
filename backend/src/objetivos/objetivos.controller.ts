import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query,
  ParseIntPipe, HttpCode, HttpStatus, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import {
  IsString, IsOptional, IsEnum, IsNumber, IsInt, IsPositive, Min,
} from 'class-validator';
import { ObjetivosService } from './objetivos.service';
import { NivelObjetivo, PeriodoObjetivo } from './entities/objetivo.entity';
import { TipoResultado } from './entities/resultado-clave.entity';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/enums/user-role.enum';

class CreateObjetivoDto {
  @IsString()                           titulo!:   string;
  @IsOptional() @IsString()             descripcion?: string;
  @IsOptional() @IsEnum(NivelObjetivo)  nivel?:    NivelObjetivo;
  @IsOptional() @IsEnum(PeriodoObjetivo)periodo?:  PeriodoObjetivo;
  @IsInt()                              anio!:     number;
  @IsOptional() @IsString()             propietario?: string;
  @IsOptional() @IsInt()                propietarioId?: number;
}

class CreateKRDto {
  @IsString()                           descripcion!: string;
  @IsOptional() @IsEnum(TipoResultado)  tipo?:        TipoResultado;
  @IsNumber() @Min(0)                   valorInicio!: number;
  @IsNumber() @Min(0)                   valorMeta!:   number;
  @IsOptional() @IsString()             unidad?:      string;
}

class ActualizarProgresoDto {
  @IsNumber()                           valorActual!: number;
}

@ApiTags('Objetivos y Metas (OKR)')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR)
@Controller('objetivos')
export class ObjetivosController {
  constructor(private svc: ObjetivosService) {}

  @Get('dashboard')
  getDashboard(@Query('anio') anio: string) {
    return this.svc.getDashboard(Number(anio ?? new Date().getFullYear()));
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  crear(@Body() dto: CreateObjetivoDto) { return this.svc.crear(dto); }

  @Get()
  listar(
    @Query('anio')    anio?:    string,
    @Query('periodo') periodo?: PeriodoObjetivo,
  ) { return this.svc.listar(anio ? Number(anio) : undefined, periodo); }

  @Get(':id')
  findById(@Param('id', ParseIntPipe) id: number) { return this.svc.findById(id); }

  @Patch(':id')
  actualizar(@Param('id', ParseIntPipe) id: number, @Body() dto: CreateObjetivoDto) {
    return this.svc.actualizar(id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  eliminar(@Param('id', ParseIntPipe) id: number) { return this.svc.eliminar(id); }

  // KRs
  @Post(':id/krs')
  @HttpCode(HttpStatus.CREATED)
  crearKR(@Param('id', ParseIntPipe) id: number, @Body() dto: CreateKRDto) {
    return this.svc.crearKR(id, dto);
  }

  @Patch('krs/:id/progreso')
  actualizarProgreso(@Param('id', ParseIntPipe) id: number, @Body() dto: ActualizarProgresoDto) {
    return this.svc.actualizarProgreso(id, dto.valorActual);
  }

  @Delete('krs/:id')
  eliminarKR(@Param('id', ParseIntPipe) id: number) { return this.svc.eliminarKR(id); }
}
