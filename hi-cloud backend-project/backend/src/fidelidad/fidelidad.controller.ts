import {
  Controller, Get, Post, Patch, Body, Param, Query,
  ParseIntPipe, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiHeader } from '@nestjs/swagger';
import {
  IsOptional, IsNumber, IsBoolean, IsInt, IsString, Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { FidelidadService } from './fidelidad.service';

class UpdateProgramaDto {
  @IsOptional() @IsString()                         nombre?: string;
  @IsOptional() @IsNumber() @Min(0) @Type(() => Number) puntosPorDOP?: number;
  @IsOptional() @IsInt() @Min(0) @Type(() => Number)    minimoCanjePoints?: number;
  @IsOptional() @IsNumber() @Min(0) @Type(() => Number) valorPorPunto?: number;
  @IsOptional() @IsInt() @Min(0) @Type(() => Number)    diasVencimiento?: number;
  @IsOptional() @IsBoolean()                        activo?: boolean;
  @IsOptional() @IsString()                         descripcion?: string;
}

class CanjearDto {
  @IsInt() @Min(1) @Type(() => Number)              puntos!: number;
  @IsOptional() @IsString()                         referenciaId?: string;
}

class AcumularDto {
  @IsNumber() @Min(0.01) @Type(() => Number)        montoFactura!: number;
  @IsString()                                        referenciaId!: string;
  @IsOptional() @IsString()                          clienteNombre?: string;
}

@ApiTags('Programa de Fidelidad')
@ApiBearerAuth('access-token')
@ApiHeader({ name: 'X-Empresa-ID', required: true })
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('fidelidad')
export class FidelidadController {
  constructor(private readonly svc: FidelidadService) {}

  @Get('resumen')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VIEWER)
  resumen() { return this.svc.resumen(); }

  @Get('programa')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VIEWER)
  @ApiOperation({ summary: 'Configuración del programa de puntos' })
  getPrograma() { return this.svc.getPrograma(); }

  @Patch('programa')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Actualizar reglas del programa de fidelidad' })
  actualizarPrograma(@Body() dto: UpdateProgramaDto) {
    return this.svc.actualizarPrograma(dto as any);
  }

  @Get('ranking')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VIEWER)
  @ApiOperation({ summary: 'Clientes con más puntos acumulados' })
  ranking(@Query('limit') limit?: string) {
    return this.svc.ranking(limit ? Number(limit) : 20);
  }

  @Get('cliente/:clienteId')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VIEWER)
  @ApiOperation({ summary: 'Saldo e historial de puntos de un cliente' })
  historial(@Param('clienteId', ParseIntPipe) id: number) {
    return this.svc.historial(id);
  }

  @Post('cliente/:clienteId/acumular')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Acumular puntos al pagar una factura' })
  acumular(
    @Param('clienteId', ParseIntPipe) id: number,
    @Body() dto: AcumularDto,
  ) {
    return this.svc.acumular(id, dto.montoFactura, dto.referenciaId, dto.clienteNombre);
  }

  @Post('cliente/:clienteId/canjear')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Canjear puntos por descuento en la próxima compra' })
  canjear(
    @Param('clienteId', ParseIntPipe) id: number,
    @Body() dto: CanjearDto,
  ) {
    return this.svc.canjear(id, dto.puntos, dto.referenciaId);
  }
}
