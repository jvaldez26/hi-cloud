import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiHeader, ApiQuery } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { IsrService } from './isr.service';

@ApiTags('ISR Nómina (Ley 11-92 RD)')
@ApiBearerAuth('access-token')
@ApiHeader({ name: 'X-Empresa-ID', required: true })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.CONTADOR)
@Controller('isr')
export class IsrController {
  constructor(private readonly svc: IsrService) {}

  @Get('plantilla')
  @ApiOperation({ summary: 'Calcular ISR de todos los empleados activos según Ley 11-92 RD' })
  calcularPlantilla() { return this.svc.calcularPlantilla(); }

  @Get('simular')
  @ApiQuery({ name: 'salario', required: true, description: 'Salario bruto mensual en RD$' })
  @ApiOperation({ summary: 'Simular ISR para un salario dado — incluye tabla de referencia' })
  simular(@Query('salario') salario: string) {
    return this.svc.simular(Number(salario));
  }
}
