import {
  Controller, Get, Post, Patch, Body, Param,
  ParseIntPipe, Query, HttpCode, HttpStatus, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { IsOptional, IsNumber, IsString, IsNotEmpty, IsInt, IsPositive, Min, MaxLength } from 'class-validator';
import { CajaService } from './caja.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { User } from '../users/users.entity';

class AbrirCajaDto {
  @IsNotEmpty() @IsInt() @IsPositive()
  vendedorId: number;

  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0)
  saldoApertura?: number;

  @IsOptional() @IsString()
  notas?: string;
}

class CerrarCajaDto {
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0)
  saldoFisico: number;

  @IsOptional() @IsString()
  notas?: string;

  @IsOptional()
  desgloseBilletes?: Record<string, number>;

  @IsOptional()
  desglosePago?: Record<string, string>;
}

class AnularCierreDto {
  @IsString() @MaxLength(300)
  motivo: string;
}

@ApiTags('Caja')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('caja')
export class CajaController {
  constructor(private cajaService: CajaService) {}

  @Get('hoy')
  @ApiOperation({ summary: 'Cajas del día (todas o filtradas por ?vendedorId)' })
  getCajaHoy(@Query('vendedorId') vendedorId?: string) {
    const vid = vendedorId !== undefined ? Number(vendedorId) : undefined;
    return this.cajaService.getCajaHoy(vid);
  }

  @Get('cajeros')
  @ApiOperation({ summary: 'Usuarios activos de la empresa (para selector de cajero)' })
  getCajeros() {
    return this.cajaService.listarCajeros();
  }

  @Post('abrir')
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR)
  @ApiOperation({ summary: 'Abrir caja del día para el cajero seleccionado' })
  abrirCaja(@Body() dto: AbrirCajaDto, @GetUser() usuario: User) {
    return this.cajaService.abrirCaja(
      usuario.id,
      dto.saldoApertura ?? 0,
      dto.notas,
      dto.vendedorId,
      undefined,  // service resuelve el nombre desde BD
    );
  }

  @Patch(':id/cerrar')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR)
  @ApiOperation({ summary: 'Cerrar caja por ID — calcula diferencia vs efectivo físico' })
  cerrarCaja(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CerrarCajaDto,
  ) {
    return this.cajaService.cerrarCaja(
      id, dto.saldoFisico, dto.notas,
      dto.desgloseBilletes, dto.desglosePago,
    );
  }

  @Patch(':id/anular')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Anular cierre de caja — regresa a estado abierta para seguir facturando' })
  anularCierre(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AnularCierreDto,
    @GetUser() usuario: User,
  ) {
    return this.cajaService.anularCierre(id, dto.motivo, usuario.id);
  }

  @Get('historial')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Historial de cierres (todos o por ?vendedorId)' })
  getHistorial(
    @Query('page')       page?:       number,
    @Query('limit')      limit?:      number,
    @Query('vendedorId') vendedorId?: string,
  ) {
    const vid = vendedorId !== undefined ? Number(vendedorId) : undefined;
    return this.cajaService.getHistorial(Number(page ?? 1), Number(limit ?? 20), vid);
  }

  @Get('resumen')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Resumen mensual de caja' })
  getResumen(
    @Query('mes')  mes:  number,
    @Query('anio') anio: number,
  ) {
    return this.cajaService.getResumenMes(Number(mes), Number(anio));
  }
}
