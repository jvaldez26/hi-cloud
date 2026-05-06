import {
  Controller, Get, Post, Patch, Param, Query,
  ParseIntPipe, HttpCode, HttpStatus, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { ComisionesService } from './comisiones.service';
import { EstadoComision } from './entities/comision.entity';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { User } from '../users/users.entity';

@ApiTags('Comisiones de Vendedores')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('comisiones')
export class ComisionesController {
  constructor(private svc: ComisionesService) {}

  @Post('calcular')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Calcular comisiones del período para todos los vendedores' })
  @ApiQuery({ name: 'mes',       required: true, example: 5 })
  @ApiQuery({ name: 'anio',      required: true, example: 2026 })
  @ApiQuery({ name: 'porcentaje',required: false, example: 5 })
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
  getMiResumen(@GetUser() usuario: User) {
    return this.svc.getResumenVendedor(usuario.id);
  }

  @Get('vendedor/:id')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Resumen de comisiones de un vendedor específico' })
  getResumenVendedor(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getResumenVendedor(id);
  }

  @Patch(':id/aprobar')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Aprobar comisión calculada' })
  aprobar(@Param('id', ParseIntPipe) id: number) {
    return this.svc.aprobar(id);
  }

  @Patch(':id/pagar')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Marcar comisión como pagada (solo ADMIN)' })
  pagar(@Param('id', ParseIntPipe) id: number) {
    return this.svc.marcarPagada(id);
  }
}
