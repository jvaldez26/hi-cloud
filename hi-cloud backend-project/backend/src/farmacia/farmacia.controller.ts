import {
  Controller, Get, Post, Put, Patch, Body, Param, Query,
  ParseIntPipe, UseGuards, Res, DefaultValuePipe,
} from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ModuloAddonGuard } from '../modulos-addon/guards/modulo-addon.guard';
import { FarmaciaService } from './farmacia.service';
import { FarmaciaPdfService } from './farmacia-pdf.service';

@UseGuards(JwtAuthGuard, ModuloAddonGuard('farmacia'))
@Controller('farmacia')
export class FarmaciaController {
  constructor(
    private readonly svc: FarmaciaService,
    private readonly pdfSvc: FarmaciaPdfService,
  ) {}

  // ── DASHBOARD ──────────────────────────────────────────────────────────────

  @Get('dashboard')
  dashboard() {
    return this.svc.dashboard();
  }

  // ── MEDICAMENTOS ───────────────────────────────────────────────────────────

  @Get('medicamentos')
  listarMedicamentos(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('search') search?: string,
    @Query('categoria') categoria?: string,
  ) {
    return this.svc.listarMedicamentos(page, limit, search, categoria);
  }

  @Get('medicamentos/buscar-barra')
  buscarPorCodigoBarra(@Query('codigo') codigo: string) {
    return this.svc.buscarPorCodigoBarra(codigo);
  }

  @Get('medicamentos/:id')
  obtenerMedicamento(@Param('id', ParseIntPipe) id: number) {
    return this.svc.obtenerMedicamento(id);
  }

  @Post('medicamentos')
  crearMedicamento(
    @Body() dto: {
      codigo?: string; codigoBarra?: string; nombreGenerico: string;
      nombreComercial?: string; laboratorio?: string; categoria?: string;
      forma?: string; concentracion?: string; via?: string; unidadMedida?: string;
      requiereReceta?: boolean; esNarcotico?: boolean; esPsicotropico?: boolean;
      esRefrigerado?: boolean; precioCompra?: number; precioVenta?: number;
      precioArs?: number; margenGanancia?: number; stockMinimo?: number;
      stockMaximo?: number; productoId?: number;
    },
  ) {
    return this.svc.crearMedicamento(dto);
  }

  @Put('medicamentos/:id')
  actualizarMedicamento(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: {
      codigo?: string; codigoBarra?: string; nombreGenerico?: string;
      nombreComercial?: string; laboratorio?: string; categoria?: string;
      forma?: string; concentracion?: string; via?: string; unidadMedida?: string;
      requiereReceta?: boolean; esNarcotico?: boolean; esPsicotropico?: boolean;
      esRefrigerado?: boolean; precioCompra?: number; precioVenta?: number;
      precioArs?: number; margenGanancia?: number; stockMinimo?: number;
      stockMaximo?: number; productoId?: number; isActive?: boolean;
    },
  ) {
    return this.svc.actualizarMedicamento(id, dto);
  }

  // ── LOTES ──────────────────────────────────────────────────────────────────

  @Get('lotes')
  listarLotes(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('medicamentoId') medicamentoId?: string,
    @Query('estado') estado?: string,
  ) {
    return this.svc.listarLotes(page, limit, medicamentoId ? +medicamentoId : undefined, estado);
  }

  @Get('lotes/proximos-vencer')
  lotesProximosVencer(@Query('dias', new DefaultValuePipe(30), ParseIntPipe) dias: number) {
    return this.svc.lotesProximosVencer(dias);
  }

  @Post('lotes')
  crearLote(
    @Body() dto: {
      medicamentoId: number; numeroLote: string; fechaFabricacion?: string;
      fechaVencimiento: string; cantidadInicial: number; proveedorId?: number;
      fechaCompra?: string; precioCompra?: number; facturaCompra?: string;
    },
  ) {
    return this.svc.crearLote(dto);
  }

  @Patch('lotes/:id')
  actualizarLote(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: { estado?: string },
  ) {
    return this.svc.actualizarLote(id, dto);
  }

  // ── DISPENSACIONES ─────────────────────────────────────────────────────────

  @Get('dispensaciones')
  listarDispensaciones(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('fecha') fecha?: string,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
  ) {
    return this.svc.listarDispensaciones(page, limit, fecha, desde, hasta);
  }

  @Get('dispensaciones/:id')
  obtenerDispensacion(@Param('id', ParseIntPipe) id: number) {
    return this.svc.obtenerDispensacion(id);
  }

  @Get('dispensaciones/:id/pdf')
  async pdfDispensacion(@Param('id', ParseIntPipe) id: number, @Res() res: Response) {
    const data = await this.svc.obtenerDispensacion(id);
    const buffer = await this.pdfSvc.generarRecibo(data);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="dispensacion-${data.numero}.pdf"`,
    });
    res.end(buffer);
  }

  @Post('dispensaciones')
  crearDispensacion(
    @Body() dto: {
      clienteId?: number; clienteNombre?: string; clienteCedula?: string;
      recetaMedico?: string; recetaNumero?: string; recetaFecha?: string;
      arsNombre?: string; arsNumeroAfiliado?: string; autorizacionArs?: string;
      farmaceuticoNombre?: string; descuento?: number; montoCubierto?: number;
      metodoPago?: string; notas?: string;
      items: Array<{
        medicamentoId: number; cantidad: number; precioUnitario: number;
        descuento?: number; instrucciones?: string; requeriReceta?: boolean;
        recetaVerificada?: boolean;
      }>;
    },
  ) {
    return this.svc.crearDispensacion(dto);
  }

  // ── RECEPCIONES ────────────────────────────────────────────────────────────

  @Get('recepciones')
  listarRecepciones(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.svc.listarRecepciones(page, limit);
  }

  @Get('recepciones/:id')
  obtenerRecepcion(@Param('id', ParseIntPipe) id: number) {
    return this.svc.obtenerRecepcion(id);
  }

  @Post('recepciones')
  crearRecepcion(
    @Body() dto: {
      fecha: string; proveedorId?: number; facturaProveedor?: string; notas?: string;
      items: Array<{
        medicamentoId: number; numeroLote: string; fechaVencimiento: string;
        cantidadOrdenada?: number; cantidadRecibida: number;
        precioCompra?: number; precioVenta?: number;
      }>;
    },
  ) {
    return this.svc.crearRecepcion(dto);
  }

  @Post('recepciones/:id/confirmar')
  confirmarRecepcion(@Param('id', ParseIntPipe) id: number) {
    return this.svc.confirmarRecepcion(id);
  }

  // ── NARCÓTICOS ─────────────────────────────────────────────────────────────

  @Get('narcoticos')
  libroNarcoticos(
    @Query('medicamentoId') medicamentoId?: string,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
  ) {
    return this.svc.libroNarcoticos(medicamentoId ? +medicamentoId : undefined, desde, hasta);
  }

  @Get('narcoticos/pdf')
  async pdfNarcoticos(
    @Query('medicamentoId') medicamentoId: string | undefined,
    @Query('desde') desde: string | undefined,
    @Query('hasta') hasta: string | undefined,
    @Res() res: Response,
  ) {
    const data = await this.svc.libroNarcoticos(medicamentoId ? +medicamentoId : undefined, desde, hasta);
    const buffer = await this.pdfSvc.generarLibroNarcoticos(data, { desde, hasta });
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="libro-narcoticos.pdf"',
    });
    res.end(buffer);
  }

  // ── DEVOLUCIONES ───────────────────────────────────────────────────────────

  @Get('devoluciones')
  listarDevoluciones(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.svc.listarDevoluciones(page, limit);
  }

  @Post('devoluciones')
  crearDevolucion(
    @Body() dto: {
      dispensacionId?: number; motivo: string; montoDevuelto?: number;
    },
  ) {
    return this.svc.crearDevolucion(dto);
  }

  // ── ARS ────────────────────────────────────────────────────────────────────

  @Get('ars')
  listarArs(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('estado') estado?: string,
  ) {
    return this.svc.listarArs(page, limit, estado);
  }

  @Post('ars')
  crearArs(
    @Body() dto: {
      arsNombre: string; periodoDesde?: string; periodoHasta?: string;
      cantidadDispensaciones?: number; montoTotal?: number; montoCubierto?: number;
      observaciones?: string;
    },
  ) {
    return this.svc.crearArs(dto);
  }

  @Patch('ars/:id')
  actualizarArs(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: {
      estado?: string; fechaEnvio?: string; fechaPago?: string;
      montoCubierto?: number; observaciones?: string;
    },
  ) {
    return this.svc.actualizarArs(id, dto);
  }

  // ── REPORTES ───────────────────────────────────────────────────────────────

  @Get('reportes/mas-vendidos')
  reporteMasVendidos(@Query('desde') desde?: string, @Query('hasta') hasta?: string) {
    return this.svc.reporteMasVendidos(desde, hasta);
  }

  @Get('reportes/ingresos')
  reporteIngresos(@Query('desde') desde?: string, @Query('hasta') hasta?: string) {
    return this.svc.reporteIngresos(desde, hasta);
  }

  @Get('reportes/stock-bajo')
  reporteStockBajo() {
    return this.svc.reporteStockBajo();
  }

  @Get('reportes/sin-movimiento')
  reporteSinMovimiento(@Query('dias', new DefaultValuePipe(30), ParseIntPipe) dias: number) {
    return this.svc.reporteMedicamentosSinMovimiento(dias);
  }

  @Get('reportes/alertas')
  alertasActivas() {
    return this.svc.alertasActivas();
  }

  @Get('reportes/vencimientos/pdf')
  async pdfVencimientos(
    @Query('dias', new DefaultValuePipe(60), ParseIntPipe) dias: number,
    @Res() res: Response,
  ) {
    const data = await this.svc.lotesProximosVencer(dias);
    const buffer = await this.pdfSvc.generarReporteVencimientos(data, dias);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="reporte-vencimientos.pdf"',
    });
    res.end(buffer);
  }
}
