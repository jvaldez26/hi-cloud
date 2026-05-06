import {
  Controller, Get, Post, Param, Query, Body,
  UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiHeader } from '@nestjs/swagger';
import {
  IsString, IsNumber, IsOptional, IsIn, Min, IsDateString,
} from 'class-validator';
import { Type } from 'class-transformer';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { DivisasService } from './divisas.service';

class RegistrarTasaDto {
  @IsString() @IsIn(['USD','EUR','GBP','CAD','JPY','CNY','CHF','MXN'])
  moneda!: string;

  @IsNumber() @Min(0) @Type(() => Number)
  tasaVenta!: number;

  @IsNumber() @Min(0) @Type(() => Number)
  tasaCompra!: number;

  @IsOptional() @IsDateString()
  fecha?: string;

  @IsOptional() @IsString()
  fuente?: string;
}

@ApiTags('Divisas & Tasas de Cambio')
@ApiBearerAuth('access-token')
@ApiHeader({ name: 'X-Empresa-ID', required: true })
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('divisas')
export class DivisasController {
  constructor(private readonly svc: DivisasService) {}

  @Get('monedas')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR, UserRole.VIEWER)
  @ApiOperation({ summary: 'Lista de monedas soportadas' })
  monedas() { return this.svc.getMonedas(); }

  @Get('tasas-hoy')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR, UserRole.VIEWER)
  @ApiOperation({ summary: 'Tasas de cambio más recientes para todas las monedas' })
  tasasHoy() { return this.svc.getTasasHoy(); }

  @Get('tasa/:moneda')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR, UserRole.VIEWER)
  @ApiOperation({ summary: 'Tasa de cambio actual para una moneda' })
  tasaActual(@Param('moneda') moneda: string) {
    return this.svc.getTasaActual(moneda);
  }

  @Get('historial/:moneda')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VIEWER)
  @ApiOperation({ summary: 'Historial de tasas de cambio' })
  historial(
    @Param('moneda') moneda: string,
    @Query('limite')  limite?: string,
  ) {
    return this.svc.getHistorial(moneda, limite ? Number(limite) : 30);
  }

  @Post('tasa')
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Registrar tasa de cambio del día' })
  registrar(@Body() dto: RegistrarTasaDto) { return this.svc.registrarTasa(dto); }

  @Get('convertir')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR, UserRole.VIEWER)
  @ApiOperation({ summary: 'Convertir monto en moneda extranjera a DOP' })
  convertir(
    @Query('monto')  monto: string,
    @Query('moneda') moneda: string,
    @Query('tipo')   tipo: string,
  ) {
    return this.svc.convertir(Number(monto), moneda, (tipo as 'venta' | 'compra') ?? 'venta');
  }
}
