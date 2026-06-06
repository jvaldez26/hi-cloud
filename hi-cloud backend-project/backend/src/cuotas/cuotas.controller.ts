import {
  Controller, Get, Post, Patch, Body, Param, Query, Res,
  ParseIntPipe, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiHeader } from '@nestjs/swagger';
import {
  IsInt, IsPositive, IsNumber, IsOptional, IsString, IsDateString, Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { User } from '../users/users.entity';
import { CuotasService } from './cuotas.service';

class CreatePlanDto {
  @IsInt() @IsPositive() @Type(() => Number)        clienteId!: number;
  @IsOptional() @IsString()                          clienteNombre?: string;
  @IsOptional() @IsInt() @Type(() => Number)         facturaId?: number;
  @IsOptional() @IsString()                          facturaFolio?: string;
  @IsNumber() @Min(0.01) @Type(() => Number)         montoTotal!: number;
  @IsOptional() @IsNumber() @Min(0) @Type(() => Number) montoInicial?: number;
  @IsInt() @Min(1) @Type(() => Number)               numeroCuotas!: number;
  @IsOptional() @IsNumber() @Min(0) @Type(() => Number) tasaInteresMensual?: number;
  @IsDateString()                                    fechaInicio!: string;
  @IsOptional() @IsString()                          notas?: string;
}

class SimularDto {
  @IsNumber() @Min(0.01) @Type(() => Number)         capital!: number;
  @IsNumber() @Min(0) @Type(() => Number)            tasa!: number;
  @IsInt() @Min(1) @Type(() => Number)               cuotas!: number;
}

@ApiTags('Cuotas / Planes de Pago')
@ApiBearerAuth('access-token')
@ApiHeader({ name: 'X-Empresa-ID', required: true })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.CONTADOR)
@Controller('cuotas')
export class CuotasController {
  constructor(private readonly svc: CuotasService) {}

  @Get('resumen')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VIEWER)
  resumen() { return this.svc.resumen(); }

  @Get('simular')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VIEWER)
  @ApiOperation({ summary: 'Simular tabla de cuotas sin crear el plan' })
  simular(
    @Query('capital') capital: string,
    @Query('tasa')    tasa:    string,
    @Query('cuotas')  cuotas:  string,
  ) {
    const c = Number(capital);
    const t = Number(tasa);
    const n = Number(cuotas);
    const montoCuota = CuotasService.calcularCuotaMensual(c, t, n);
    return {
      capital: c, tasaMensual: t, numeroCuotas: n, montoCuota,
      totalPagar:  +(montoCuota * n).toFixed(2),
      totalInteres: +(montoCuota * n - c).toFixed(2),
    };
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VIEWER)
  listar(@Query('clienteId') clienteId?: string) {
    return this.svc.listar(clienteId ? Number(clienteId) : undefined);
  }

  @Get('cuota/:cuotaId/comprobante')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VIEWER)
  @ApiOperation({ summary: 'Generar comprobante PDF de una cuota pagada' })
  async comprobante(
    @Param('cuotaId', ParseIntPipe) cuotaId: number,
    @Res() res: Response,
  ) {
    const { buffer, filename } = await this.svc.generarComprobantePDF(cuotaId);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.length);
    res.end(buffer);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VIEWER)
  findOne(@Param('id', ParseIntPipe) id: number) { return this.svc.findOne(id); }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Crear plan de pago en cuotas (genera tabla de amortización automáticamente)' })
  crear(@Body() dto: CreatePlanDto, @GetUser() user: User) {
    return this.svc.crear(dto, user.id);
  }

  @Patch('cuota/:id/pagar')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Registrar pago de una cuota específica' })
  pagar(
    @Param('id', ParseIntPipe) id: number,
    @Query('referencia') referencia?: string,
  ) {
    return this.svc.pagarCuota(id, referencia);
  }
}
