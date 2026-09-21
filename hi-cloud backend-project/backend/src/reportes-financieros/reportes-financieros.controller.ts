import { Controller, Get, Query, Param, ParseIntPipe, UseGuards, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery, ApiHeader } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { ReportesFinancierosService } from './reportes-financieros.service';
import { BalanceComprobacionService } from './balance-comprobacion.service';
import { ReportesPdfService }         from './reportes-pdf.service';
import { BalanceGeneralDetalladoService, FiltrosBalanceGeneralDetallado } from './balance-general-detallado.service';
import { BalanceGeneralExportService } from './balance-general-export.service';
import { EstadoResultadosDetalladoService, FiltrosEstadoResultadosDetallado } from './estado-resultados-detallado.service';
import { EstadoResultadosExportService } from './estado-resultados-export.service';
import { fechaHoyRD } from '../common/utils/fecha-local.util';

@ApiTags('Reportes Financieros')
@ApiBearerAuth('access-token')
@ApiHeader({ name: 'X-Empresa-ID', required: false })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.CONTADOR)
@Controller('reportes-financieros')
export class ReportesFinancierosController {
  constructor(
    private readonly svc:      ReportesFinancierosService,
    private readonly balSvc:   BalanceComprobacionService,
    private readonly pdfSvc:   ReportesPdfService,
    private readonly bgSvc:    BalanceGeneralDetalladoService,
    private readonly bgExpSvc: BalanceGeneralExportService,
    private readonly erSvc:    EstadoResultadosDetalladoService,
    private readonly erExpSvc: EstadoResultadosExportService,
  ) {}

  /** Query params → FiltrosBalanceGeneralDetallado (validación real vive en el service). */
  private parseFiltrosBG(q: Record<string, string | undefined>): FiltrosBalanceGeneralDetallado {
    return {
      fechaCorte:            q.fechaCorte ?? fechaHoyRD(),
      compararCon:           q.compararCon as any,
      fechaComparacion:      q.fechaComparacion,
      nivelDetalle:          (q.nivelDetalle === 'todos' ? 'todos' : q.nivelDetalle ? Number(q.nivelDetalle) : undefined) as any,
      ocultarCuentasEnCero:  q.ocultarCuentasEnCero === undefined ? undefined : q.ocultarCuentasEnCero !== 'false',
    };
  }

  private parseOpcionesExportBG(q: Record<string, string | undefined>) {
    return {
      mostrarCodigo:              q.mostrarCodigo === undefined ? undefined : q.mostrarCodigo !== 'false',
      mostrarPorcentajeVertical:  q.mostrarPorcentajeVertical === undefined ? undefined : q.mostrarPorcentajeVertical !== 'false',
    };
  }

  /** Query params → FiltrosEstadoResultadosDetallado (validación real vive en el service). */
  private parseFiltrosER(q: Record<string, string | undefined>): FiltrosEstadoResultadosDetallado {
    const hoy = fechaHoyRD();
    const inicioAnio = `${new Date().getFullYear()}-01-01`;
    return {
      desde:                 q.desde ?? inicioAnio,
      hasta:                 q.hasta ?? hoy,
      comparacion:           q.comparacion as any,
      ocultarCuentasEnCero:  q.ocultarCuentasEnCero === undefined ? undefined : q.ocultarCuentasEnCero !== 'false',
    };
  }

  @Get('resumen')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VIEWER)
  @ApiOperation({ summary: 'Resumen ejecutivo: utilidades + balance en una sola llamada' })
  resumen(
    @Query('desde')        desde?: string,
    @Query('hasta')        hasta?: string,
    @Query('fechaBalance') fechaBalance?: string,
  ) {
    const hoy    = fechaHoyRD();
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
    return this.svc.balanceGeneral(fechaCorte ?? fechaHoyRD());
  }

  @Get('balance-general-detallado')
  @ApiOperation({ summary: 'Balance General con filtros: comparativo, nivel de detalle, árbol jerárquico y % vertical' })
  @ApiQuery({ name: 'fechaCorte', required: false })
  @ApiQuery({ name: 'compararCon', required: false, enum: ['ninguno', 'mismo-mes-anio-anterior', 'cierre-anio-anterior', 'fecha-manual'] })
  @ApiQuery({ name: 'fechaComparacion', required: false })
  @ApiQuery({ name: 'nivelDetalle', required: false, enum: ['1', '2', '3', 'todos'] })
  @ApiQuery({ name: 'ocultarCuentasEnCero', required: false })
  balanceGeneralDetallado(@Query() q: Record<string, string | undefined>) {
    return this.bgSvc.generar(this.parseFiltrosBG(q));
  }

  @Get('balance-general-detallado/excel')
  @ApiOperation({ summary: 'Descargar Balance General detallado en Excel, respetando los filtros activos' })
  async balanceGeneralDetalladoExcel(@Query() q: Record<string, string | undefined>, @Res() res: Response) {
    const { buffer, filename } = await this.bgExpSvc.generarExcel(this.parseFiltrosBG(q), this.parseOpcionesExportBG(q));
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
    });
    res.send(buffer);
  }

  @Get('balance-general-detallado/csv')
  @ApiOperation({ summary: 'Descargar Balance General detallado en CSV, respetando los filtros activos' })
  async balanceGeneralDetalladoCsv(@Query() q: Record<string, string | undefined>, @Res() res: Response) {
    const { buffer, filename } = await this.bgExpSvc.generarCsv(this.parseFiltrosBG(q), this.parseOpcionesExportBG(q));
    res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${filename}"` });
    res.send(buffer);
  }

  @Get('balance-general-detallado/pdf')
  @ApiOperation({ summary: 'Descargar Balance General detallado en PDF, respetando los filtros activos' })
  async balanceGeneralDetalladoPdf(@Query() q: Record<string, string | undefined>, @Res() res: Response) {
    const { buffer, filename } = await this.bgExpSvc.generarPdf(this.parseFiltrosBG(q));
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${filename}"` });
    res.send(buffer);
  }

  @Get('estado-resultados-detallado')
  @ApiOperation({ summary: 'Estado de Resultados con filtros: bloques por clasificación operacional/no operacional, % Ingresos, % Margen y 4 modos de comparación' })
  @ApiQuery({ name: 'desde', required: false })
  @ApiQuery({ name: 'hasta', required: false })
  @ApiQuery({ name: 'comparacion', required: false, enum: ['ninguna', 'mes-vs-acumulado', 'anio-anterior', 'por-mes'] })
  @ApiQuery({ name: 'ocultarCuentasEnCero', required: false })
  estadoResultadosDetallado(@Query() q: Record<string, string | undefined>) {
    return this.erSvc.generar(this.parseFiltrosER(q));
  }

  @Get('estado-resultados-detallado/excel')
  @ApiOperation({ summary: 'Descargar Estado de Resultados detallado en Excel, respetando los filtros y la vista de comparación activa' })
  async estadoResultadosDetalladoExcel(@Query() q: Record<string, string | undefined>, @Res() res: Response) {
    const { buffer, filename } = await this.erExpSvc.generarExcel(this.parseFiltrosER(q));
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
    });
    res.send(buffer);
  }

  @Get('estado-resultados-detallado/csv')
  @ApiOperation({ summary: 'Descargar Estado de Resultados detallado en CSV, respetando los filtros y la vista de comparación activa' })
  async estadoResultadosDetalladoCsv(@Query() q: Record<string, string | undefined>, @Res() res: Response) {
    const { buffer, filename } = await this.erExpSvc.generarCsv(this.parseFiltrosER(q));
    res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${filename}"` });
    res.send(buffer);
  }

  @Get('estado-resultados-detallado/pdf')
  @ApiOperation({ summary: 'Descargar Estado de Resultados detallado en PDF, respetando los filtros activos' })
  async estadoResultadosDetalladoPdf(@Query() q: Record<string, string | undefined>, @Res() res: Response) {
    const { buffer, filename } = await this.erExpSvc.generarPdf(this.parseFiltrosER(q));
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${filename}"` });
    res.send(buffer);
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

  @Get('asientos-descuadrados')
  @ApiOperation({ summary: 'Listado de asientos donde totalDebe ≠ totalHaber — respalda la línea del Balance General' })
  @ApiQuery({ name: 'hasta', required: false, description: 'Fecha de corte (default: sin límite)' })
  asientosDescuadrados(@Query('hasta') hasta?: string) {
    return this.svc.asientosDescuadrados(hasta);
  }

  // ── PDF exports ────────────────────────────────────────────────────────────

  @Get('estado-resultados/pdf')
  @ApiOperation({ summary: 'Descargar Estado de Resultados en PDF' })
  async estadoResultadosPdf(
    @Query('desde') desde: string,
    @Query('hasta') hasta: string,
    @Res() res: Response,
  ) {
    const hoy    = fechaHoyRD();
    const inicio = `${new Date().getFullYear()}-01-01`;
    const { buffer, filename } = await this.pdfSvc.generarEstadoResultadosPDF(desde ?? inicio, hasta ?? hoy);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${filename}"` });
    res.send(buffer);
  }

  @Get('balance-general/pdf')
  @ApiOperation({ summary: 'Descargar Balance General en PDF' })
  async balanceGeneralPdf(
    @Query('fechaCorte') fechaCorte: string,
    @Res() res: Response,
  ) {
    const hoy = fechaHoyRD();
    const { buffer, filename } = await this.pdfSvc.generarBalanceGeneralPDF(fechaCorte ?? hoy);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${filename}"` });
    res.send(buffer);
  }
}
