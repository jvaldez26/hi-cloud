import {
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { ReportesService } from './reportes.service';
import { FiltroFechaDto } from './dto/filtro-fecha.dto';
import { FiltroMesAnioDto } from './dto/filtro-mes-anio.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { User } from '../users/users.entity';

@ApiTags('Reportes & Dashboard')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('reportes')
export class ReportesController {
  constructor(private reportesService: ReportesService) {}

  // ── Dashboard ──────────────────────────────────────────────────────────────

  @Get('dashboard')
  @ApiOperation({ summary: 'Dashboard principal — métricas filtradas por rol automáticamente' })
  getDashboard(@GetUser() usuario: User) {
    return this.reportesService.getDashboard(usuario.id, usuario.role);
  }

  @Get('kpis')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'KPIs completos: ventas, compras, alertas, top clientes/productos' })
  getKPIs() {
    return this.reportesService.getKPIs();
  }

  // ── Ventas ─────────────────────────────────────────────────────────────────

  @Get('ventas')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR)
  @ApiOperation({ summary: 'Ventas del período con totales y desglose por estado' })
  @ApiQuery({ name: 'fechaDesde', required: true, example: '2026-01-01' })
  @ApiQuery({ name: 'fechaHasta', required: true, example: '2026-12-31' })
  getVentasPorPeriodo(@Query() dto: FiltroFechaDto) {
    return this.reportesService.getVentasPorPeriodo(dto);
  }

  @Get('ventas/por-cliente')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Ranking de clientes por ventas en el período' })
  getVentasPorCliente(@Query() dto: FiltroFechaDto) {
    return this.reportesService.getVentasPorCliente(dto);
  }

  @Get('ventas/por-producto')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR)
  @ApiOperation({ summary: 'Ranking de productos más vendidos en el período' })
  getVentasPorProducto(@Query() dto: FiltroFechaDto) {
    return this.reportesService.getVentasPorProducto(dto);
  }

  @Get('ventas/por-dia')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR)
  @ApiOperation({ summary: 'Ventas diarias del mes (datos para gráfica de barras)' })
  @ApiQuery({ name: 'mes',  required: true, example: 5 })
  @ApiQuery({ name: 'anio', required: true, example: 2026 })
  getVentasPorDia(@Query() dto: FiltroMesAnioDto) {
    return this.reportesService.getVentasPorDia(dto);
  }

  @Get('facturas-pendientes')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR)
  @ApiOperation({ summary: 'Facturas emitidas pendientes de cobro con días transcurridos' })
  getFacturasPendientes() {
    return this.reportesService.getFacturasPendientes();
  }

  // ── Compras ────────────────────────────────────────────────────────────────

  @Get('compras')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Compras del período con totales e ITBIS pagado' })
  getComprasPorPeriodo(@Query() dto: FiltroFechaDto) {
    return this.reportesService.getComprasPorPeriodo(dto);
  }

  @Get('compras/por-proveedor')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Ranking de proveedores por compras en el período' })
  getComprasPorProveedor(@Query() dto: FiltroFechaDto) {
    return this.reportesService.getComprasPorProveedor(dto);
  }

  @Get('compras/por-dia')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Compras diarias del mes (datos para gráfica)' })
  getComprasPorDia(@Query() dto: FiltroMesAnioDto) {
    return this.reportesService.getComprasPorDia(dto);
  }

  // ── Fiscal / DGII ──────────────────────────────────────────────────────────

  @Get('fiscal/606')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Formato 606 DGII — Reporte de compras para declaración fiscal' })
  getReporte606(@Query() dto: FiltroMesAnioDto) {
    return this.reportesService.getReporte606(dto);
  }

  @Get('fiscal/607')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Formato 607 DGII — Comprobantes anulados del período' })
  getReporte607(@Query() dto: FiltroMesAnioDto) {
    return this.reportesService.getReporte607(dto);
  }

  @Get('fiscal/itbis')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Balance ITBIS: cobrado en ventas vs pagado en compras' })
  getReporteITBIS(@Query() dto: FiltroMesAnioDto) {
    return this.reportesService.getReporteITBIS(dto);
  }

  @Get('fiscal/ecf')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'e-CFs del mes por estado DGII (pendiente/aceptado/rechazado)' })
  getECFsPorEstado(@Query() dto: FiltroMesAnioDto) {
    return this.reportesService.getECFsPorEstado(dto);
  }

  // ── Inventario ─────────────────────────────────────────────────────────────

  @Get('inventario/stock')
  @ApiOperation({ summary: 'Stock actual de todos los productos con alertas' })
  getStockActual() {
    return this.reportesService.getStockActual();
  }

  @Get('inventario/stock-bajo')
  @ApiOperation({ summary: 'Productos con stock igual o menor al mínimo' })
  getStockBajo() {
    return this.reportesService.getStockBajo();
  }

  @Get('inventario/movimientos')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Movimientos de inventario del período: entradas vs salidas' })
  getMovimientosPorPeriodo(@Query() dto: FiltroFechaDto) {
    return this.reportesService.getMovimientosPorPeriodo(dto);
  }

  @Get('inventario/valor')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Valor total del inventario al costo por categoría' })
  getValorInventario() {
    return this.reportesService.getValorInventario();
  }
}
