import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiHeader } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { AnalyticsService } from './analytics.service';

@ApiTags('Analytics & BI')
@ApiBearerAuth('access-token')
@ApiHeader({ name: 'X-Empresa-ID', required: true })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VIEWER)
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly svc: AnalyticsService) {}

  @Get('overview')
  @ApiOperation({ summary: 'Resumen ejecutivo: ventas, CxC, CxP, conversión' })
  overview(
    @Query('desde') desde?: string,
    @Query('hasta')  hasta?: string,
  ) { return this.svc.overview(desde, hasta); }

  @Get('ventas-tendencia')
  @ApiOperation({ summary: 'Evolución de ventas por mes (hasta 24 meses)' })
  ventasTendencia(@Query('meses') meses?: string) {
    return this.svc.ventasTendencia(meses ? Number(meses) : 12);
  }

  @Get('top-clientes')
  @ApiOperation({ summary: 'Top clientes por volumen de ventas del período' })
  topClientes(
    @Query('limit') limit?: string,
    @Query('desde') desde?: string,
    @Query('hasta')  hasta?: string,
  ) { return this.svc.topClientes(limit ? Number(limit) : 10, desde, hasta); }

  @Get('top-productos')
  @ApiOperation({ summary: 'Top productos por ingresos del período' })
  topProductos(
    @Query('limit') limit?: string,
    @Query('desde') desde?: string,
    @Query('hasta')  hasta?: string,
  ) { return this.svc.topProductos(limit ? Number(limit) : 10, desde, hasta); }

  @Get('cxc-aging')
  @ApiOperation({ summary: 'Antigüedad de saldos CxC (aging report)' })
  cxcAging() { return this.svc.cxcAging(); }

  @Get('embudo-ventas')
  @ApiOperation({ summary: 'Embudo Leads → Cotizaciones → Facturas' })
  embudoVentas() { return this.svc.embudoVentas(); }

  @Get('ventas-por-vendedor')
  @ApiOperation({ summary: 'Ventas agrupadas por vendedor del período' })
  ventasPorVendedor(
    @Query('desde') desde?: string,
    @Query('hasta')  hasta?: string,
  ) { return this.svc.ventasPorVendedor(desde, hasta); }

  @Get('horas-pico')
  @ApiOperation({ summary: 'Días y horas con más ventas' })
  horasPico(@Query('meses') meses?: string) {
    return this.svc.horasPico(meses ? Number(meses) : 3);
  }
}
