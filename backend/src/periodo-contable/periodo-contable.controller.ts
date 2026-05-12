import {
  Controller, Get, Post, Patch, Param, Body, Query,
  ParseIntPipe, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiHeader } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { User } from '../users/users.entity';
import { PeriodoContableService } from './periodo-contable.service';

class CreatePeriodoDto {
  @IsInt() @Min(2000) @Max(2099)
  @Type(() => Number)
  anio!: number;

  @IsInt() @Min(1) @Max(12)
  @Type(() => Number)
  mes!: number;

  @IsOptional() @IsString()
  notas?: string;
}

class GenerarAnioDto {
  @IsInt() @Min(2000) @Max(2099)
  @Type(() => Number)
  anio!: number;
}

class CerrarPeriodoDto {
  @IsOptional() @IsString()
  notasCierre?: string;
}

@ApiTags('Períodos Contables')
@ApiBearerAuth('access-token')
@ApiHeader({ name: 'X-Empresa-ID', description: 'ID de la empresa activa', required: true })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.CONTADOR)
@Controller('periodo-contable')
export class PeriodoContableController {
  constructor(private readonly svc: PeriodoContableService) {}

  @Get('resumen')
  @ApiOperation({ summary: 'Resumen del año: totales, estados y lista de los 12 períodos' })
  resumen(@Query('anio') anio?: string) {
    return this.svc.resumen(anio ? Number(anio) : undefined);
  }

  @Get('actual')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR, UserRole.VIEWER)
  @ApiOperation({ summary: 'Período del mes actual (abierto)' })
  getPeriodoActual() {
    return this.svc.getPeriodoActual();
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR, UserRole.VIEWER)
  @ApiOperation({ summary: 'Listar períodos, filtrar por ?anio=2026' })
  listar(@Query('anio') anio?: string) {
    return this.svc.listar(anio ? Number(anio) : undefined);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR, UserRole.VIEWER)
  @ApiOperation({ summary: 'Detalle de un período' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.svc.findOne(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Crear período individual' })
  crear(@Body() dto: CreatePeriodoDto, @GetUser() user: User) {
    return this.svc.crear(dto, user.id);
  }

  @Post('generar-anio')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Generar los 12 períodos de un año de una vez' })
  generarAnio(@Body() dto: GenerarAnioDto) {
    return this.svc.generarAnio(dto.anio);
  }

  @Patch(':id/cerrar')
  @ApiOperation({ summary: 'Cerrar período — calcula totales de asientos del mes' })
  cerrar(
    @Param('id', ParseIntPipe) id: number,
    @GetUser() user: User,
    @Body() dto: CerrarPeriodoDto,
  ) {
    return this.svc.cerrar(id, user.id, dto);
  }

  @Patch(':id/reabrir')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Reabrir período cerrado (solo ADMIN)' })
  reabrir(@Param('id', ParseIntPipe) id: number) {
    return this.svc.reabrir(id);
  }

  @Patch(':id/bloquear')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Bloquear período permanentemente (irreversible)' })
  bloquear(@Param('id', ParseIntPipe) id: number) {
    return this.svc.bloquear(id);
  }
}
