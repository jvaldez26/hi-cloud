import {
  Controller, Get, Post, Param, Body, Query,
  ParseIntPipe, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiHeader } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsInt, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { CreditoClienteService } from './credito-cliente.service';

class SetCreditoDto {
  @IsNumber() @Min(0) @Type(() => Number) limiteCredito!: number;
  @IsOptional() @IsInt() @Min(1) @Type(() => Number) diasPlazo?: number;
  @IsOptional() @IsString() notas?: string;
}

@ApiTags('Crédito al Cliente')
@ApiBearerAuth('access-token')
@ApiHeader({ name: 'X-Empresa-ID', required: true })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.CONTADOR)
@Controller('credito-cliente')
export class CreditoClienteController {
  constructor(private readonly svc: CreditoClienteService) {}

  @Get('resumen')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VIEWER)
  @ApiOperation({ summary: 'Resumen global de crédito: límites, utilizados, en riesgo' })
  resumen() { return this.svc.resumen(); }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VIEWER)
  @ApiOperation({ summary: 'Listar todos los clientes con crédito configurado' })
  listar() { return this.svc.listarCreditos(); }

  @Get(':clienteId')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VIEWER)
  @ApiOperation({ summary: 'Estado de crédito de un cliente específico' })
  getCredito(@Param('clienteId', ParseIntPipe) id: number) {
    return this.svc.getCredito(id);
  }

  @Get(':clienteId/validar')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Validar si el cliente puede recibir una nueva venta a crédito' })
  validar(
    @Param('clienteId', ParseIntPipe) id: number,
    @Query('monto') monto: string,
  ) {
    return this.svc.validarCredito(id, Number(monto ?? 0));
  }

  @Post(':clienteId')
  @ApiOperation({ summary: 'Configurar o actualizar límite de crédito del cliente' })
  setCredito(
    @Param('clienteId', ParseIntPipe) id: number,
    @Body() dto: SetCreditoDto,
  ) {
    return this.svc.setCredito(id, dto);
  }
}
