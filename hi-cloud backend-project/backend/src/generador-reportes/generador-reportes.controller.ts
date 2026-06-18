import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiHeader } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { GeneradorReportesService } from './generador-reportes.service';
import { fechaHoyRD } from '../common/utils/fecha-local.util';

const HOY    = () => fechaHoyRD();
const INICIO = () => `${new Date().getFullYear()}-01-01`;

@ApiTags('Generador de Reportes')
@ApiBearerAuth('access-token')
@ApiHeader({ name: 'X-Empresa-ID', required: true })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VIEWER)
@Throttle({ default: { limit: 30, ttl: 60_000 } }) // B-06: máx 30 reportes/min por IP
@Controller('reportes-gen')
export class GeneradorReportesController {
  constructor(private readonly svc: GeneradorReportesService) {}

  @Get('ventas-periodo')
  @ApiOperation({ summary: 'Ventas agrupadas por día/semana/mes' })
  ventasPeriodo(
    @Query('desde') desde = INICIO(),
    @Query('hasta') hasta = HOY(),
    @Query('agrupar') agrupar: 'dia' | 'semana' | 'mes' = 'mes',
  ) { return this.svc.ventasPorPeriodo(desde, hasta, agrupar); }

  @Get('top-clientes')
  topClientes(@Query('desde') desde = INICIO(), @Query('hasta') hasta = HOY(), @Query('limite') limite = '20') {
    return this.svc.topClientes(desde, hasta, Number(limite));
  }

  @Get('top-productos')
  topProductos(@Query('desde') desde = INICIO(), @Query('hasta') hasta = HOY(), @Query('limite') limite = '20') {
    return this.svc.topProductos(desde, hasta, Number(limite));
  }

  @Get('inventario-critico')
  @ApiOperation({ summary: 'Productos con stock bajo o sin stock' })
  inventarioCritico() { return this.svc.inventarioCritico(); }

  @Get('gastos-categoria')
  gastosPorCategoria(@Query('desde') desde = INICIO(), @Query('hasta') hasta = HOY()) {
    return this.svc.gastosPorCategoria(desde, hasta);
  }

  @Get('balance-nomina')
  balanceNomina(@Query('mes') mes?: string, @Query('anio') anio?: string) {
    const hoy = new Date();
    return this.svc.balanceNomina(mes ? Number(mes) : hoy.getMonth() + 1, anio ? Number(anio) : hoy.getFullYear());
  }

  @Get('cxc-aging')
  @ApiOperation({ summary: 'Antigüedad de cuentas por cobrar pendientes' })
  cxcAging() { return this.svc.cxcAging(); }

  @Get('comparativo-mensual')
  comparativoMensual(@Query('anio') anio?: string) {
    return this.svc.comparativoMensual(anio ? Number(anio) : new Date().getFullYear());
  }

  @Get('compras-proveedor')
  comprasPorProveedor(@Query('desde') desde = INICIO(), @Query('hasta') hasta = HOY()) {
    return this.svc.comprasPorProveedor(desde, hasta);
  }
}
