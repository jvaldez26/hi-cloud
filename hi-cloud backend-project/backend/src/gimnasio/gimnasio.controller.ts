import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query,
  ParseIntPipe, UseGuards, Logger, Res, Request,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../tenant/tenant.guard';
import { ModuloAddonGuard } from '../modulos-addon/guards/modulo-addon.guard';
import { TenantService } from '../tenant/tenant.service';
import { GimnasioService } from './gimnasio.service';
import { GimnasioPdfService } from './gimnasio-pdf.service';

@Controller('gimnasio')
@UseGuards(JwtAuthGuard, TenantGuard, ModuloAddonGuard('gimnasio'))
@ApiTags('Gimnasio')
@ApiBearerAuth()
export class GimnasioController {
  private readonly logger = new Logger(GimnasioController.name);

  constructor(
    private readonly svc: GimnasioService,
    private readonly pdfSvc: GimnasioPdfService,
    private readonly tenantSvc: TenantService,
  ) {}

  private get empresaId() {
    return this.tenantSvc.getEmpresaId();
  }

  // ── DASHBOARD ────────────────────────────────────────────────────────────────

  @Get('dashboard')
  getDashboard() {
    return this.svc.getDashboard(this.empresaId);
  }

  // ── MIEMBROS ─────────────────────────────────────────────────────────────────

  @Get('miembros')
  getMiembros(@Query() q: any) {
    return this.svc.getMiembros(this.empresaId, q);
  }

  @Post('miembros')
  crearMiembro(@Body() body: any) {
    return this.svc.crearMiembro(body, this.empresaId);
  }

  @Get('miembros/qr/:codigo')
  getMiembroByQR(@Param('codigo') codigo: string) {
    return this.svc.getMiembroByQR(codigo, this.empresaId);
  }

  @Get('miembros/:id')
  getMiembro(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getMiembro(id, this.empresaId);
  }

  @Patch('miembros/:id')
  actualizarMiembro(@Param('id', ParseIntPipe) id: number, @Body() body: any) {
    return this.svc.actualizarMiembro(id, body, this.empresaId);
  }

  @Get('miembros/:id/membresia-activa')
  getMembresiaActiva(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getMiembroMembresiaActiva(id, this.empresaId);
  }

  @Get('miembros/:id/historial-accesos')
  getHistorialAccesos(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getMiembroHistorialAccesos(id, this.empresaId);
  }

  @Get('miembros/:id/clases-reservadas')
  getClasesReservadas(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getMiembroClasesReservadas(id, this.empresaId);
  }

  @Get('miembros/:id/progreso')
  getProgresoMiembro(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getMiembroProgreso(id, this.empresaId);
  }

  @Get('miembros/:id/rutina-activa')
  getRutinaActiva(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getMiembroRutinaActiva(id, this.empresaId);
  }

  // ── PLANES ──────────────────────────────────────────────────────────────────

  @Get('planes')
  getPlanes() {
    return this.svc.getPlanes(this.empresaId);
  }

  @Post('planes')
  crearPlan(@Body() body: any) {
    return this.svc.crearPlan(body, this.empresaId);
  }

  @Patch('planes/:id')
  actualizarPlan(@Param('id', ParseIntPipe) id: number, @Body() body: any) {
    return this.svc.actualizarPlan(id, body, this.empresaId);
  }

  // ── MEMBRESÍAS ──────────────────────────────────────────────────────────────

  @Get('membresias/proximas-vencer')
  getProximasVencer() {
    return this.svc.getMembresiasProximasVencer(this.empresaId);
  }

  @Get('membresias')
  getMembresias(@Query() q: any) {
    return this.svc.getMembresias(this.empresaId, q);
  }

  @Post('membresias')
  crearMembresia(@Body() body: any) {
    return this.svc.crearMembresia(body, this.empresaId);
  }

  @Get('membresias/:id')
  getMembresia(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getMembresia(id, this.empresaId);
  }

  @Patch('membresias/:id')
  actualizarMembresia(@Param('id', ParseIntPipe) id: number, @Body() body: any) {
    return this.svc.actualizarMembresia(id, body, this.empresaId);
  }

  @Post('membresias/:id/renovar')
  renovarMembresia(@Param('id', ParseIntPipe) id: number) {
    return this.svc.renovarMembresia(id, this.empresaId);
  }

  @Post('membresias/:id/congelar')
  congelarMembresia(@Param('id', ParseIntPipe) id: number, @Body() body: any) {
    return this.svc.congelarMembresia(id, body, this.empresaId);
  }

  @Post('membresias/:id/descongelar')
  descongelarMembresia(@Param('id', ParseIntPipe) id: number) {
    return this.svc.descongelarMembresia(id, this.empresaId);
  }

  // ── ENTRENADORES ─────────────────────────────────────────────────────────────

  @Get('entrenadores')
  getEntrenadores() {
    return this.svc.getEntrenadores(this.empresaId);
  }

  @Post('entrenadores')
  crearEntrenador(@Body() body: any) {
    return this.svc.crearEntrenador(body, this.empresaId);
  }

  @Get('entrenadores/:id/agenda')
  getAgendaEntrenador(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getEntrenadorAgenda(id, this.empresaId);
  }

  // ── CLASES Y SCHEDULE ───────────────────────────────────────────────────────

  @Get('clases')
  getClases() {
    return this.svc.getClases(this.empresaId);
  }

  @Post('clases')
  crearClase(@Body() body: any) {
    return this.svc.crearClase(body, this.empresaId);
  }

  @Get('schedule/hoy')
  getScheduleHoy() {
    return this.svc.getScheduleHoy(this.empresaId);
  }

  @Get('schedule')
  getSchedule(@Query() q: any) {
    return this.svc.getSchedule(this.empresaId, q);
  }

  @Post('schedule')
  crearSchedule(@Body() body: any) {
    return this.svc.crearSchedule(body, this.empresaId);
  }

  @Get('schedule/:id/asistentes')
  getAsistentes(@Param('id', ParseIntPipe) id: number, @Query('fecha') fecha: string) {
    return this.svc.getScheduleAsistentes(id, fecha, this.empresaId);
  }

  // ── RESERVAS ────────────────────────────────────────────────────────────────

  @Post('reservas')
  crearReserva(@Body() body: any) {
    return this.svc.crearReserva(body, this.empresaId);
  }

  @Delete('reservas/:id')
  cancelarReserva(@Param('id', ParseIntPipe) id: number) {
    return this.svc.cancelarReserva(id, this.empresaId);
  }

  @Patch('reservas/:id/asistencia')
  registrarAsistencia(@Param('id', ParseIntPipe) id: number, @Body() body: any) {
    return this.svc.registrarAsistencia(id, body.estado, this.empresaId);
  }

  // ── SESIONES EP ─────────────────────────────────────────────────────────────

  @Get('sesiones-ep')
  getSesionesEP(@Query() q: any) {
    return this.svc.getSesionesEP(this.empresaId, q);
  }

  @Post('sesiones-ep')
  crearSesionEP(@Body() body: any) {
    return this.svc.crearSesionEP(body, this.empresaId);
  }

  @Patch('sesiones-ep/:id')
  actualizarSesionEP(@Param('id', ParseIntPipe) id: number, @Body() body: any) {
    return this.svc.actualizarSesionEP(id, body, this.empresaId);
  }

  // ── RUTINAS ─────────────────────────────────────────────────────────────────

  @Get('rutinas')
  getRutinas(@Query() q: any) {
    return this.svc.getRutinas(this.empresaId, q.miembroId ? Number(q.miembroId) : undefined);
  }

  @Post('rutinas')
  crearRutina(@Body() body: any) {
    return this.svc.crearRutina(body, this.empresaId);
  }

  @Get('rutinas/:id')
  getRutina(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getRutina(id, this.empresaId);
  }

  @Patch('rutinas/:id')
  actualizarRutina(@Param('id', ParseIntPipe) id: number, @Body() body: any) {
    return this.svc.actualizarRutina(id, body, this.empresaId);
  }

  @Get('rutinas/:id/pdf')
  async getRutinaPdf(@Param('id', ParseIntPipe) id: number, @Res() res: Response) {
    const rutina = await this.svc.getRutina(id, this.empresaId);
    const pdf = await this.pdfSvc.generarRutinaPdf(rutina);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="rutina-${id}.pdf"`,
      'Content-Length': String(pdf.length),
    });
    res.end(pdf);
  }

  // ── PROGRESO ────────────────────────────────────────────────────────────────

  @Get('progreso')
  getProgreso(@Query() q: any) {
    const miembroId = q.miembroId ? Number(q.miembroId) : undefined;
    return this.svc.getProgreso(this.empresaId, miembroId);
  }

  @Post('progreso')
  crearProgreso(@Body() body: any) {
    return this.svc.crearProgreso(body, this.empresaId);
  }

  @Get('progreso/:miembroId/grafica')
  getProgresoGrafica(@Param('miembroId', ParseIntPipe) miembroId: number) {
    return this.svc.getProgresoGrafica(miembroId, this.empresaId);
  }

  // ── ACCESOS ─────────────────────────────────────────────────────────────────

  @Post('accesos/registrar')
  registrarAcceso(@Body() body: { codigo: string }) {
    return this.svc.registrarAcceso(body.codigo, this.empresaId);
  }

  @Get('accesos/hoy')
  getAccesosHoy() {
    return this.svc.getAccesosHoy(this.empresaId);
  }

  @Get('accesos')
  getAccesos(@Query() q: any) {
    return this.svc.getAccesos(this.empresaId, q);
  }

  // ── LOCKERS ─────────────────────────────────────────────────────────────────

  @Get('lockers')
  getLockers(@Query('estado') estado: string) {
    return this.svc.getLockers(this.empresaId, estado);
  }

  @Post('lockers')
  createLocker(@Body() body: any) {
    return this.svc.createLocker(body, this.empresaId);
  }

  @Post('lockers/asignar')
  asignarLocker(@Body() body: any) {
    return this.svc.asignarLocker(body, this.empresaId);
  }

  @Patch('lockers/:id/liberar')
  liberarLocker(@Param('id', ParseIntPipe) id: number) {
    return this.svc.liberarLocker(id, this.empresaId);
  }

  @Patch('lockers/:id')
  updateLocker(@Param('id', ParseIntPipe) id: number, @Body() body: any) {
    return this.svc.updateLocker(id, body, this.empresaId);
  }

  @Delete('lockers/:id')
  deleteLocker(@Param('id', ParseIntPipe) id: number) {
    return this.svc.deleteLocker(id, this.empresaId);
  }

  // ── NUTRICION ────────────────────────────────────────────────────────────────

  @Get('nutricion')
  getNutricion(@Query() q: any) {
    return this.svc.getPlanesNutricionales(this.empresaId, q.miembroId ? Number(q.miembroId) : undefined);
  }

  @Post('nutricion')
  crearPlanNutricional(@Body() body: any) {
    return this.svc.crearPlanNutricional(body, this.empresaId);
  }

  @Get('nutricion/:id/pdf')
  async getNutricionPdf(@Param('id', ParseIntPipe) id: number, @Res() res: Response) {
    const planes = await this.svc.getPlanesNutricionales(this.empresaId);
    const plan = planes.find((p: any) => p.id === id);
    if (!plan) {
      res.status(404).json({ message: 'Plan nutricional no encontrado' });
      return;
    }
    const pdf = await this.pdfSvc.generarNutricionPdf(plan);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="nutricion-${id}.pdf"`,
      'Content-Length': String(pdf.length),
    });
    res.end(pdf);
  }

  // ── TIENDA ──────────────────────────────────────────────────────────────────

  @Get('tienda')
  getTienda() {
    return this.svc.getProductosTienda(this.empresaId);
  }

  @Post('tienda/venta')
  ventaTienda(@Body() body: any) {
    return this.svc.ventaTienda(body, this.empresaId);
  }

  @Post('tienda/productos')
  createProductoTienda(@Body() body: any) {
    return this.svc.createProductoTienda(body, this.empresaId);
  }

  @Patch('tienda/productos/:id')
  updateProductoTienda(@Param('id', ParseIntPipe) id: number, @Body() body: any) {
    return this.svc.updateProductoTienda(id, body, this.empresaId);
  }

  @Delete('tienda/productos/:id')
  deleteProductoTienda(@Param('id', ParseIntPipe) id: number) {
    return this.svc.deleteProductoTienda(id, this.empresaId);
  }
}
