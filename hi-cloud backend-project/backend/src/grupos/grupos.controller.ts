import {
  Controller, Get, Post, Patch, Delete, Body, Param,
  ParseIntPipe, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiHeader } from '@nestjs/swagger';
import { IsString, IsOptional, IsInt, IsNumber, IsBoolean, Min, Max, IsPositive } from 'class-validator';
import { Type } from 'class-transformer';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { GruposService } from './grupos.service';

class CreateGrupoDto {
  @IsString()                                    codigo!: string;
  @IsString()                                    nombre!: string;
  @IsOptional() @IsString()                      descripcion?: string;
  @IsOptional() @IsInt() @IsPositive() @Type(() => Number) parentId?: number;
}

class CreateSegmentoDto {
  @IsString()                                    codigo!: string;
  @IsString()                                    nombre!: string;
  @IsOptional() @IsString()                      descripcion?: string;
  @IsOptional() @IsNumber() @Min(0) @Max(100) @Type(() => Number) descuentoPct?: number;
  @IsOptional() @IsInt() @Min(0) @Type(() => Number)              diasCreditoDefault?: number;
}

@ApiTags('Grupos & Segmentos')
@ApiBearerAuth('access-token')
@ApiHeader({ name: 'X-Empresa-ID', required: true })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.CONTADOR)
@Controller('grupos')
export class GruposController {
  constructor(private readonly svc: GruposService) {}

  // ─── Grupos de Producto ───────────────────────────────────────────────────────

  @Get('productos')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR, UserRole.VIEWER)
  @ApiOperation({ summary: 'Lista jerárquica de grupos de productos' })
  listarGrupos() { return this.svc.listarGrupos(); }

  @Get('productos/flat')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR, UserRole.VIEWER)
  @ApiOperation({ summary: 'Lista plana de grupos activos (para selects)' })
  listarGruposFlat() { return this.svc.listarGruposFlat(); }

  @Post('productos')
  @HttpCode(HttpStatus.CREATED)
  crearGrupo(@Body() dto: CreateGrupoDto) { return this.svc.crearGrupo(dto); }

  @Patch('productos/:id')
  actualizarGrupo(@Param('id', ParseIntPipe) id: number, @Body() dto: Partial<CreateGrupoDto>) {
    return this.svc.actualizarGrupo(id, dto as any);
  }

  @Delete('productos/:id')
  eliminarGrupo(@Param('id', ParseIntPipe) id: number) { return this.svc.eliminarGrupo(id); }

  // ─── Segmentos de Cliente ─────────────────────────────────────────────────────

  @Get('clientes')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR, UserRole.VIEWER)
  @ApiOperation({ summary: 'Segmentos de clientes con descuento y días de crédito' })
  listarSegmentos() { return this.svc.listarSegmentos(); }

  @Post('clientes')
  @HttpCode(HttpStatus.CREATED)
  crearSegmento(@Body() dto: CreateSegmentoDto) { return this.svc.crearSegmento(dto); }

  @Patch('clientes/:id')
  actualizarSegmento(@Param('id', ParseIntPipe) id: number, @Body() dto: Partial<CreateSegmentoDto>) {
    return this.svc.actualizarSegmento(id, dto as any);
  }

  @Delete('clientes/:id')
  eliminarSegmento(@Param('id', ParseIntPipe) id: number) { return this.svc.eliminarSegmento(id); }
}
