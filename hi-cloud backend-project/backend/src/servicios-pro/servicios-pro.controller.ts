import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query,
  ParseIntPipe, UseGuards, Logger, Res, Request,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../tenant/tenant.guard';
import { ModuloAddonGuard } from '../modulos-addon/guards/modulo-addon.guard';
import { ServiciosProService } from './servicios-pro.service';
import { ServiciosProPdfService } from './servicios-pro-pdf.service';
import { fechaHoyRD } from '../common/utils/fecha-local.util';

@Controller('servicios-pro')
@UseGuards(JwtAuthGuard, TenantGuard, ModuloAddonGuard('servicios_pro'))
@ApiTags('Servicios Profesionales')
@ApiBearerAuth()
export class ServiciosProController {
  private readonly logger = new Logger(ServiciosProController.name);

  constructor(
    private readonly svc: ServiciosProService,
    private readonly pdfSvc: ServiciosProPdfService,
  ) {}

  // ── DASHBOARD ────────────────────────────────────────────────────────────────

  @Get('dashboard')
  getDashboard() {
    return this.svc.getDashboard();
  }

  // ── PROFESIONALES ────────────────────────────────────────────────────────────

  @Get('profesionales')
  getProfesionales() {
    return this.svc.getProfesionales();
  }

  @Post('profesionales')
  crearProfesional(@Body() body: any) {
    return this.svc.crearProfesional(body);
  }

  @Patch('profesionales/:id')
  actualizarProfesional(@Param('id', ParseIntPipe) id: number, @Body() body: any) {
    return this.svc.actualizarProfesional(id, body);
  }

  @Get('profesionales/:id/tiempo')
  getProfesionalTiempo(@Param('id', ParseIntPipe) id: number, @Query() q: any) {
    return this.svc.getProfesionalTiempo(id, q);
  }

  @Get('profesionales/:id/carga')
  getProfesionalCarga(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getProfesionalCarga(id);
  }

  // ── EXPEDIENTES ──────────────────────────────────────────────────────────────

  @Get('expedientes')
  getExpedientes(@Query() q: any) {
    return this.svc.getExpedientes(q);
  }

  @Post('expedientes')
  crearExpediente(@Body() body: any) {
    return this.svc.crearExpediente(body);
  }

  @Get('expedientes/:id')
  getExpediente(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getExpediente(id);
  }

  @Patch('expedientes/:id')
  actualizarExpediente(@Param('id', ParseIntPipe) id: number, @Body() body: any) {
    return this.svc.actualizarExpediente(id, body);
  }

  @Get('expedientes/:id/resumen')
  getExpedienteResumen(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getExpedienteResumen(id);
  }

  @Get('expedientes/:id/tiempo')
  getExpedienteTiempo(@Param('id', ParseIntPipe) id: number, @Query() q: any) {
    return this.svc.getExpedienteTiempo(id, q);
  }

  @Get('expedientes/:id/tareas')
  getExpedienteTareas(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getExpedienteTareas(id);
  }

  @Get('expedientes/:id/gastos')
  getExpedienteGastos(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getExpedienteGastos(id);
  }

  @Get('expedientes/:id/documentos')
  getExpedienteDocumentos(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getExpedienteDocumentos(id);
  }

  @Get('expedientes/:id/reuniones')
  getExpedienteReuniones(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getExpedienteReuniones(id);
  }

  @Get('expedientes/:id/estado-cuenta-pdf')
  async getEstadoCuentaPdf(
    @Param('id', ParseIntPipe) id: number,
    @Res() res: Response,
  ) {
    const resumen = await this.svc.getExpedienteResumen(id);
    const pdf = await this.pdfSvc.generarEstadoCuentaPdf(resumen);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="estado-cuenta-${id}.pdf"`,
      'Content-Length': String(pdf.length),
    });
    res.end(pdf);
  }

  @Post('expedientes/:id/generar-factura')
  generarFactura(@Param('id', ParseIntPipe) id: number, @Body() body: any) {
    return this.svc.generarHonorarios({ ...body, expedienteId: id });
  }

  // ── TAREAS ───────────────────────────────────────────────────────────────────

  @Get('tareas')
  getTareas(@Query() q: any) {
    return this.svc.getTareas(q);
  }

  @Post('tareas')
  crearTarea(@Body() body: any) {
    return this.svc.crearTarea(body);
  }

  @Patch('tareas/:id')
  actualizarTarea(@Param('id', ParseIntPipe) id: number, @Body() body: any) {
    return this.svc.actualizarTarea(id, body);
  }

  @Patch('tareas/:id/estado')
  actualizarEstadoTarea(@Param('id', ParseIntPipe) id: number, @Body() body: any) {
    return this.svc.actualizarTarea(id, { estado: body.estado });
  }

  @Delete('tareas/:id')
  eliminarTarea(@Param('id', ParseIntPipe) id: number) {
    return this.svc.eliminarTarea(id);
  }

  // ── TIME TRACKING ────────────────────────────────────────────────────────────

  @Get('tiempo')
  getTiempo(@Query() q: any) {
    return this.svc.getTiempo(q);
  }

  @Post('tiempo')
  crearTiempo(@Body() body: any) {
    return this.svc.crearTiempo(body);
  }

  @Patch('tiempo/:id')
  actualizarTiempo(@Param('id', ParseIntPipe) id: number, @Body() body: any) {
    return this.svc.actualizarTiempo(id, body);
  }

  @Delete('tiempo/:id')
  eliminarTiempo(@Param('id', ParseIntPipe) id: number) {
    return this.svc.eliminarTiempo(id);
  }

  @Post('tiempo/timer/start')
  iniciarTimer(@Body() body: any) {
    return this.svc.iniciarTimer(body);
  }

  @Post('tiempo/timer/stop')
  detenerTimer(@Body() body: any) {
    return this.svc.detenerTimer(body);
  }

  @Get('tiempo/timer/activo')
  getTimerActivo(@Query('profesionalId') profesionalId: string) {
    return this.svc.getTimerActivo(Number(profesionalId));
  }

  // ── GASTOS ───────────────────────────────────────────────────────────────────

  @Get('gastos')
  getGastos(@Query() q: any) {
    return this.svc.getGastos(q);
  }

  @Post('gastos')
  crearGasto(@Body() body: any) {
    return this.svc.crearGasto(body);
  }

  @Patch('gastos/:id')
  actualizarGasto(@Param('id', ParseIntPipe) id: number, @Body() body: any) {
    return this.svc.actualizarGasto(id, body);
  }

  // ── CONTRATOS ────────────────────────────────────────────────────────────────

  @Get('contratos')
  getContratos(@Query() q: any) {
    return this.svc.getContratos(q);
  }

  @Post('contratos')
  crearContrato(@Body() body: any) {
    return this.svc.crearContrato(body);
  }

  @Get('contratos/:id')
  getContrato(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getContrato(id);
  }

  @Patch('contratos/:id')
  actualizarContrato(@Param('id', ParseIntPipe) id: number, @Body() body: any) {
    return this.svc.actualizarContrato(id, body);
  }

  @Get('contratos/:id/pdf')
  async getContratoPdf(@Param('id', ParseIntPipe) id: number, @Res() res: Response) {
    const contrato = await this.svc.getContrato(id);
    const pdf = await this.pdfSvc.generarContratoPdf(contrato);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="contrato-${contrato.numero}.pdf"`,
      'Content-Length': String(pdf.length),
    });
    res.end(pdf);
  }

  // ── DOCUMENTOS ───────────────────────────────────────────────────────────────

  @Post('documentos')
  crearDocumento(@Body() body: any) {
    return this.svc.crearDocumento(body);
  }

  @Delete('documentos/:id')
  eliminarDocumento(@Param('id', ParseIntPipe) id: number) {
    return this.svc.eliminarDocumento(id);
  }

  // ── REUNIONES ────────────────────────────────────────────────────────────────

  @Get('reuniones')
  getReuniones(@Query() q: any) {
    return this.svc.getReuniones(q);
  }

  @Post('reuniones')
  crearReunion(@Body() body: any) {
    return this.svc.crearReunion(body);
  }

  @Patch('reuniones/:id')
  actualizarReunion(@Param('id', ParseIntPipe) id: number, @Body() body: any) {
    return this.svc.actualizarReunion(id, body);
  }

  // ── HONORARIOS ───────────────────────────────────────────────────────────────

  @Get('honorarios')
  getHonorarios(@Query() q: any) {
    return this.svc.getHonorarios(q);
  }

  @Post('honorarios/generar')
  generarHonorarios(@Body() body: any) {
    return this.svc.generarHonorarios(body);
  }

  @Patch('honorarios/:id')
  actualizarHonorario(@Param('id', ParseIntPipe) id: number, @Body() body: any) {
    return this.svc.actualizarHonorario(id, body);
  }

  @Get('honorarios/:id/pdf')
  async getHonorarioPdf(@Param('id', ParseIntPipe) id: number, @Res() res: Response) {
    const honorario = await this.svc.getHonorario(id);
    const pdf = await this.pdfSvc.generarHonorarioPdf(honorario);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="honorario-${honorario.numero}.pdf"`,
      'Content-Length': String(pdf.length),
    });
    res.end(pdf);
  }

  @Post('honorarios/:id/enviar')
  enviarHonorario(@Param('id', ParseIntPipe) id: number) {
    return this.svc.actualizarHonorario(id, { estado: 'enviada', fechaEnvio: fechaHoyRD() });
  }

  @Patch('honorarios/:id/pagar')
  marcarHonorarioPagado(@Param('id', ParseIntPipe) id: number, @Body() body: any) {
    return this.svc.marcarHonorarioPagado(id, body.fechaPago ?? fechaHoyRD());
  }

  @Patch('contratos/:id/firmar')
  marcarContratoFirmado(@Param('id', ParseIntPipe) id: number) {
    return this.svc.marcarContratoFirmado(id);
  }

  // ── RETAINERS ────────────────────────────────────────────────────────────────

  @Get('retainers')
  getRetainers(@Query() q: any) {
    return this.svc.getRetainers();
  }

  @Post('retainers')
  crearRetainer(@Body() body: any) {
    return this.svc.crearRetainer(body);
  }

  @Patch('retainers/:id')
  actualizarRetainer(@Param('id', ParseIntPipe) id: number, @Body() body: any) {
    return this.svc.actualizarRetainer(id, body);
  }

  @Post('retainers/:id/pagar')
  registrarPagoRetainer(@Param('id', ParseIntPipe) id: number, @Body() body: any) {
    return this.svc.registrarPagoRetainer(id, body);
  }

  @Get('retainers/:id/historial')
  getHistorialRetainer(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getHistorialRetainer(id);
  }

  @Post('retainers/:id/facturar-mes')
  facturarMesRetainer(@Param('id', ParseIntPipe) id: number) {
    return this.svc.facturarMesRetainer(id);
  }

  // ── REPORTES ─────────────────────────────────────────────────────────────────

  @Get('reportes/horas-profesional')
  getReporteHorasProfesional(@Query() q: any) {
    return this.svc.getReporteHorasProfesional(q);
  }

  @Get('reportes/tiempo')
  getReporteTiempo(@Query() q: any) {
    return this.svc.getReporteTiempoDetalle(q);
  }

  @Get('reportes/tiempo/pdf')
  async getReporteTiempoPdf(@Query() q: any, @Res() res: Response) {
    const tiempos = await this.svc.getReporteTiempoDetalle(q);
    const desde   = q.desde ?? '';
    const hasta   = q.hasta ?? '';
    const pdf = await this.pdfSvc.generarReporteTiempoPdf({ profesionalNombre: 'Todos' } as any, tiempos, desde, hasta);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="reporte-tiempo-${desde}-${hasta}.pdf"`, 'Content-Length': String(pdf.length) });
    res.end(pdf);
  }

  @Get('reportes/rentabilidad')
  getReporteRentabilidad() {
    return this.svc.getReporteRentabilidad();
  }
}
