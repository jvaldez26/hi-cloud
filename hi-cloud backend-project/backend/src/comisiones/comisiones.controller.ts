import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query,
  ParseIntPipe, HttpCode, HttpStatus, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import {
  IsString, IsEnum, IsNumber, IsInt, IsOptional,
  IsBoolean, Min, Max, IsPositive,
} from 'class-validator';
import { ComisionesService } from './comisiones.service';
import { EstadoComision } from './entities/comision.entity';
import { TipoReglaComision } from './entities/regla-comision.entity';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { User } from '../users/users.entity';

class CreateReglaDto {
  @IsString()                           nombre!:          string;
  @IsEnum(TipoReglaComision)            tipo!:            TipoReglaComision;
  @IsNumber() @Min(0) @Max(100)         porcentaje!:      number;
  @IsOptional() @IsInt() @Min(1)        prioridad?:       number;
  @IsOptional() @IsInt() @IsPositive()  vendedorId?:      number;
  @IsOptional() @IsString()             categoria?:       string;
  @IsOptional() @IsNumber() @Min(0)     montoDesde?:      number;
  @IsOptional() @IsNumber() @Min(0)     montoHasta?:      number;
  @IsOptional() @IsInt() @Min(0)        diasMaximoCobro?: number;
  @IsOptional() @IsString()             descripcion?:     string;
}

class SimularDto {
  @IsOptional() @IsInt() @IsPositive()  vendedorId?: number;
  @IsNumber() @Min(0)                   monto!:      number;
  @IsOptional() @IsString()             categoria?:  string;
  @IsOptional() @IsInt() @Min(0)        diasPago?:   number;
}

@ApiTags('Comisiones de Vendedores')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('comisiones')
export class ComisionesController {
  constructor(private svc: ComisionesService) {}

  // ── Reglas de comisión ────────────────────────────────────────────────────

  @Post('reglas')
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Crear regla de comisión (por vendedor, categoría, monto, antigüedad o global)' })
  crearRegla(@Body() dto: CreateReglaDto) { return this.svc.crearRegla(dto); }

  @Get('reglas')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Listar reglas de comisión activas ordenadas por prioridad' })
  getReglas() { return this.svc.getReglas(); }

  @Patch('reglas/:id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Actualizar regla de comisión' })
  updateRegla(@Param('id', ParseIntPipe) id: number, @Body() dto: CreateReglaDto) {
    return this.svc.updateRegla(id, dto as any);
  }

  @Delete('reglas/:id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Eliminar regla de comisión' })
  deleteRegla(@Param('id', ParseIntPipe) id: number) { return this.svc.deleteRegla(id); }

  // ── Simulador ──────────────────────────────────────────────────────────────

  @Post('simular')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Simular comisión para un monto dado — muestra qué regla aplica' })
  simular(@Body() dto: SimularDto) { return this.svc.simular(dto); }

  // ── Cálculo y listado ──────────────────────────────────────────────────────

  @Post('calcular')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Calcular comisiones del período aplicando reglas avanzadas' })
  @ApiQuery({ name: 'mes',        required: true,  example: 5 })
  @ApiQuery({ name: 'anio',       required: true,  example: 2026 })
  @ApiQuery({ name: 'porcentaje', required: false, example: 5 })
  calcular(
    @Query('mes')        mes:        number,
    @Query('anio')       anio:       number,
    @Query('porcentaje') porcentaje?: number,
  ) {
    return this.svc.calcularPeriodo(Number(mes), Number(anio), Number(porcentaje ?? 5));
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Listar comisiones con filtros' })
  listar(
    @Query('periodo')    periodo?:    string,
    @Query('vendedorId') vendedorId?: number,
    @Query('estado')     estado?:     EstadoComision,
  ) {
    return this.svc.listar({ periodo, vendedorId: vendedorId ? Number(vendedorId) : undefined, estado });
  }

  @Get('mi-resumen')
  @ApiOperation({ summary: 'Resumen de comisiones del usuario autenticado (vendedor)' })
  getMiResumen(@GetUser() usuario: User) { return this.svc.getResumenVendedor(usuario.id); }

  @Get('vendedor/:id')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Resumen de comisiones de un vendedor específico' })
  getResumenVendedor(@Param('id', ParseIntPipe) id: number) { return this.svc.getResumenVendedor(id); }

  @Patch(':id/aprobar')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Aprobar comisión calculada' })
  aprobar(@Param('id', ParseIntPipe) id: number) { return this.svc.aprobar(id); }

  @Patch(':id/pagar')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Marcar comisión como pagada (solo ADMIN)' })
  pagar(@Param('id', ParseIntPipe) id: number) { return this.svc.marcarPagada(id); }
}
