import { Controller, Get, Query, Param, ParseIntPipe, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery, ApiHeader } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { ReportesFinancierosService } from './reportes-financieros.service';
import { BalanceComprobacionService } from './balance-comprobacion.service';

@ApiTags('Reportes Financieros')
@ApiBearerAuth('access-token')
@ApiHeader({ name: 'X-Empresa-ID', required: false })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.CONTADOR)
@Controller('reportes-financieros')
export class ReportesFinancierosController {
  constructor(
    private readonly svc:    ReportesFinancierosService,
    private readonly balSvc: BalanceComprobacionService,
  ) {}

  @Get('resumen')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VIEWER)
  @ApiOperation({ summary: 'Resumen ejecutivo: utilidades + balance en una sola llamada' })
  resumen(
    @Query('desde')        desde?: string,
    @Query('hasta')        hasta?: string,
    @Query('fechaBalance') fechaBalance?: string,
  ) {
    const hoy    = new Date().toISOString().split('T')[0];
    const inicio = `${new Date().getFullYear()}-01-01`;
    return this.svc.resumenEjecutivo(desde ?? inicio, hasta ?? hoy, fechaBalance ?? hoy);
  }

  @Get('estado-resultados')
  @ApiOperation({ summary: 'Estado de Resultados (P&L)' })
  estadoResultados(@Query('desde') desde: string, @Query('hasta') hasta: string) {
    return this.svc.estadoResultados(desde, hasta);
  }

  @Get('balance-general')
  @ApiOperation({ summary: 'Balance General a una fecha de corte' })
  balanceGeneral(@Query('fechaCorte') fechaCorte?: string) {
    return this.svc.balanceGeneral(fechaCorte ?? new Date().toISOString().split('T')[0]);
  }

  @Get('flujo-efectivo')
  @ApiOperation({ summary: 'Flujo de Efectivo por período' })
  flujoEfectivo(@Query('desde') desde: string, @Query('hasta') hasta: string) {
    return this.svc.flujoEfectivo(desde, hasta);
  }

  // ─── Nuevos endpoints ──────────────────────────────────────────────────────

  @Get('balance-comprobacion')
  @ApiOperation({ summary: 'Balance de Comprobación — todas las cuentas con debe/haber/saldo' })
  @ApiQuery({ name: 'hasta', required: false, description: 'Fecha de corte (default: hoy)' })
  balanceComprobacion(@Query('hasta') hasta?: string) {
    return this.balSvc.getBalance(hasta);
  }

  @Get('estado-cuenta-proveedor/:proveedorId')
  @ApiOperation({ summary: 'Estado de cuenta de un proveedor — compras y pagos' })
  estadoCuentaProveedor(@Param('proveedorId', ParseIntPipe) id: number) {
    return this.balSvc.estadoCuentaProveedor(id);
  }
}
