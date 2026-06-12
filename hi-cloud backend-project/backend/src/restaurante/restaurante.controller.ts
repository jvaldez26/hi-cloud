import {
  Controller, Get, Post, Patch, Delete, Param, Body, Query, Res,
  UseGuards, ParseIntPipe, DefaultValuePipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ModuloAddonGuard } from '../modulos-addon/guards/modulo-addon.guard';
import { RestauranteService } from './restaurante.service';
import { RestaurantePdfService } from './restaurante-pdf.service';

@ApiTags('Restaurante')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, ModuloAddonGuard('restaurante'))
@Controller('restaurante')
export class RestauranteController {
  constructor(
    private readonly svc: RestauranteService,
    private readonly pdfSvc: RestaurantePdfService,
  ) {}

  // ── DASHBOARD ─────────────────────────────────────────────────────────────
  @Get('dashboard')
  @ApiOperation({ summary: 'KPIs y datos en tiempo real del restaurante' })
  dashboard() { return this.svc.dashboard(); }

  // ── ÁREAS ─────────────────────────────────────────────────────────────────
  @Get('areas')
  @ApiOperation({ summary: 'Listar áreas/zonas' })
  listarAreas() { return this.svc.listarAreas(); }

  @Post('areas')
  @ApiOperation({ summary: 'Crear área/zona' })
  crearArea(@Body() dto: any) { return this.svc.crearArea(dto); }

  @Patch('areas/:id')
  @ApiOperation({ summary: 'Actualizar área/zona' })
  actualizarArea(@Param('id', ParseIntPipe) id: number, @Body() dto: any) {
    return this.svc.actualizarArea(id, dto);
  }

  // ── MESAS ─────────────────────────────────────────────────────────────────
  @Get('mesas/mapa')
  @ApiOperation({ summary: 'Mapa visual de todas las mesas por área' })
  mapaMesas() { return this.svc.mapaMesas(); }

  @Get('mesas')
  @ApiOperation({ summary: 'Listar mesas' })
  listarMesas(
    @Query('areaId') areaId?: string,
    @Query('estado') estado?: string,
  ) {
    return this.svc.listarMesas(areaId ? +areaId : undefined, estado);
  }

  @Post('mesas')
  @ApiOperation({ summary: 'Crear mesa' })
  crearMesa(@Body() dto: any) { return this.svc.crearMesa(dto); }

  @Patch('mesas/:id')
  @ApiOperation({ summary: 'Actualizar mesa (estado, posición, etc.)' })
  actualizarMesa(@Param('id', ParseIntPipe) id: number, @Body() dto: any) {
    return this.svc.actualizarMesa(id, dto);
  }

  // ── MENÚ ──────────────────────────────────────────────────────────────────
  @Get('menu/categorias')
  @ApiOperation({ summary: 'Listar categorías del menú' })
  listarCategorias() { return this.svc.listarCategorias(); }

  @Post('menu/categorias')
  @ApiOperation({ summary: 'Crear categoría del menú' })
  crearCategoria(@Body() dto: any) { return this.svc.crearCategoria(dto); }

  @Patch('menu/categorias/:id')
  @ApiOperation({ summary: 'Actualizar categoría del menú' })
  actualizarCategoria(@Param('id', ParseIntPipe) id: number, @Body() dto: any) {
    return this.svc.actualizarCategoria(id, dto);
  }

  @Get('menu')
  @ApiOperation({ summary: 'Listar ítems del menú' })
  listarMenu(
    @Query('categoriaId') categoriaId?: string,
    @Query('disponible') disponible?: string,
    @Query('search') search?: string,
  ) {
    const disp = disponible !== undefined ? disponible === 'true' : undefined;
    return this.svc.listarMenu(categoriaId ? +categoriaId : undefined, disp, search);
  }

  @Get('menu/:id')
  @ApiOperation({ summary: 'Obtener ítem del menú' })
  obtenerMenuItem(@Param('id', ParseIntPipe) id: number) {
    return this.svc.obtenerMenuItem(id);
  }

  @Post('menu')
  @ApiOperation({ summary: 'Crear ítem del menú' })
  crearMenuItem(@Body() dto: any) { return this.svc.crearMenuItem(dto); }

  @Patch('menu/:id')
  @ApiOperation({ summary: 'Actualizar ítem del menú' })
  actualizarMenuItem(@Param('id', ParseIntPipe) id: number, @Body() dto: any) {
    return this.svc.actualizarMenuItem(id, dto);
  }

  @Patch('menu/:id/disponibilidad')
  @ApiOperation({ summary: 'Toggle disponibilidad del ítem (activo/agotado)' })
  toggleDisponibilidad(@Param('id', ParseIntPipe) id: number) {
    return this.svc.toggleDisponibilidad(id);
  }

  @Get('menu/:id/modificadores')
  @ApiOperation({ summary: 'Listar modificadores de un ítem' })
  listarModificadores(@Param('id', ParseIntPipe) id: number) {
    return this.svc.listarModificadores(id);
  }

  @Post('menu/modificadores')
  @ApiOperation({ summary: 'Crear modificador' })
  crearModificador(@Body() dto: any) { return this.svc.crearModificador(dto); }

  // ── RESERVACIONES ─────────────────────────────────────────────────────────
  @Get('reservaciones')
  @ApiOperation({ summary: 'Listar reservaciones' })
  listarReservaciones(@Query('fecha') fecha?: string, @Query('estado') estado?: string) {
    return this.svc.listarReservaciones(fecha, estado);
  }

  @Post('reservaciones')
  @ApiOperation({ summary: 'Crear reservación' })
  crearReservacion(@Body() dto: any) { return this.svc.crearReservacion(dto); }

  @Patch('reservaciones/:id')
  @ApiOperation({ summary: 'Actualizar reservación' })
  actualizarReservacion(@Param('id', ParseIntPipe) id: number, @Body() dto: any) {
    return this.svc.actualizarReservacion(id, dto);
  }

  @Patch('reservaciones/:id/sentar')
  @ApiOperation({ summary: 'Marcar cliente como sentado' })
  sentarReservacion(@Param('id', ParseIntPipe) id: number) {
    return this.svc.sentarReservacion(id);
  }

  // ── COMANDAS ──────────────────────────────────────────────────────────────
  @Get('comandas')
  @ApiOperation({ summary: 'Listar comandas' })
  listarComandas(@Query('estado') estado?: string, @Query('mesaId') mesaId?: string) {
    return this.svc.listarComandas(estado, mesaId ? +mesaId : undefined);
  }

  @Post('comandas')
  @ApiOperation({ summary: 'Abrir comanda en una mesa' })
  abrirComanda(@Body() dto: any) { return this.svc.abrirComanda(dto); }

  @Get('comandas/:id')
  @ApiOperation({ summary: 'Obtener comanda con sus ítems' })
  obtenerComanda(@Param('id', ParseIntPipe) id: number) {
    return this.svc.obtenerComanda(id);
  }

  @Post('comandas/:id/items')
  @ApiOperation({ summary: 'Agregar ítem a la comanda' })
  agregarItem(@Param('id', ParseIntPipe) id: number, @Body() dto: any) {
    return this.svc.agregarItem(id, dto);
  }

  @Patch('comandas/:id/items/:itemId')
  @ApiOperation({ summary: 'Actualizar ítem de la comanda' })
  actualizarItem(
    @Param('id', ParseIntPipe) id: number,
    @Param('itemId', ParseIntPipe) itemId: number,
    @Body() dto: any,
  ) {
    return this.svc.actualizarItem(id, itemId, dto);
  }

  @Delete('comandas/:id/items/:itemId')
  @ApiOperation({ summary: 'Cancelar ítem de la comanda' })
  cancelarItem(
    @Param('id', ParseIntPipe) id: number,
    @Param('itemId', ParseIntPipe) itemId: number,
    @Body() dto: { motivo?: string },
  ) {
    return this.svc.cancelarItem(id, itemId, dto.motivo);
  }

  @Post('comandas/:id/enviar-cocina')
  @ApiOperation({ summary: 'Enviar comanda a cocina' })
  enviarACocina(@Param('id', ParseIntPipe) id: number) {
    return this.svc.enviarACocina(id);
  }

  @Post('comandas/:id/cobrar')
  @ApiOperation({ summary: 'Cobrar comanda y cerrar mesa' })
  cobrarComanda(@Param('id', ParseIntPipe) id: number, @Body() dto: any) {
    return this.svc.cobrarComanda(id, dto);
  }

  @Post('comandas/:id/dividir')
  @ApiOperation({ summary: 'Dividir cuenta en múltiples partes' })
  dividirCuenta(@Param('id', ParseIntPipe) id: number, @Body() dto: { divisiones: { items: number[] }[] }) {
    return this.svc.dividirCuenta(id, dto.divisiones);
  }

  @Get('comandas/:id/pdf')
  @ApiOperation({ summary: 'Generar pre-cuenta en PDF' })
  async pdfPreCuenta(@Param('id', ParseIntPipe) id: number, @Res() res: Response) {
    const comanda = await this.svc.obtenerComanda(id);
    const buffer = await this.pdfSvc.generarPreCuenta(comanda);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="comanda-${comanda.numero}.pdf"` });
    res.end(buffer);
  }

  @Get('comandas/:id/ticket-cocina')
  @ApiOperation({ summary: 'Ticket de cocina en PDF' })
  async ticketCocina(@Param('id', ParseIntPipe) id: number, @Res() res: Response) {
    const comanda = await this.svc.obtenerComanda(id);
    const buffer = await this.pdfSvc.generarTicketCocina(comanda);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="cocina-${comanda.numero}.pdf"` });
    res.end(buffer);
  }

  // ── KDS ───────────────────────────────────────────────────────────────────
  @Get('kds/pendientes')
  @ApiOperation({ summary: 'Ítems pendientes de preparar (KDS)' })
  kdsItemsPendientes() { return this.svc.kdsItemsPendientes(); }

  @Patch('kds/items/:id/iniciar')
  @ApiOperation({ summary: 'Marcar ítem en preparación (KDS)' })
  kdsIniciarItem(@Param('id', ParseIntPipe) id: number) { return this.svc.kdsIniciarItem(id); }

  @Patch('kds/items/:id/listo')
  @ApiOperation({ summary: 'Marcar ítem listo (KDS)' })
  kdsMarcarListo(@Param('id', ParseIntPipe) id: number) { return this.svc.kdsMarcarListo(id); }

  @Get('kds/estaciones')
  @ApiOperation({ summary: 'Listar estaciones KDS' })
  listarEstaciones() { return this.svc.listarEstaciones(); }

  @Post('kds/estaciones')
  @ApiOperation({ summary: 'Crear estación KDS' })
  crearEstacion(@Body() dto: any) { return this.svc.crearEstacion(dto); }

  // ── DELIVERY ──────────────────────────────────────────────────────────────
  @Get('delivery')
  @ApiOperation({ summary: 'Listar pedidos delivery' })
  listarDelivery(
    @Query('estado') estado?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(30), ParseIntPipe) limit?: number,
  ) {
    return this.svc.listarDelivery(estado, page, limit);
  }

  @Post('delivery')
  @ApiOperation({ summary: 'Crear pedido delivery' })
  crearDelivery(@Body() dto: any) { return this.svc.crearDelivery(dto); }

  @Patch('delivery/:id/estado')
  @ApiOperation({ summary: 'Actualizar estado del pedido delivery' })
  actualizarEstadoDelivery(@Param('id', ParseIntPipe) id: number, @Body() dto: { estado: string }) {
    return this.svc.actualizarEstadoDelivery(id, dto.estado);
  }

  @Post('delivery/:id/asignar-repartidor')
  @ApiOperation({ summary: 'Asignar repartidor al pedido' })
  asignarRepartidor(@Param('id', ParseIntPipe) id: number, @Body() dto: any) {
    return this.svc.asignarRepartidor(id, dto);
  }

  // ── TURNOS ────────────────────────────────────────────────────────────────
  @Get('turnos')
  @ApiOperation({ summary: 'Listar turnos' })
  listarTurnos(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.svc.listarTurnos(page, limit);
  }

  @Post('turnos/abrir')
  @ApiOperation({ summary: 'Abrir turno de caja' })
  abrirTurno(@Body() dto: any) { return this.svc.abrirTurno(dto); }

  @Patch('turnos/:id/cerrar')
  @ApiOperation({ summary: 'Cerrar turno de caja' })
  cerrarTurno(@Param('id', ParseIntPipe) id: number, @Body() dto: any) {
    return this.svc.cerrarTurno(id, dto);
  }

  @Get('turnos/:id/resumen')
  @ApiOperation({ summary: 'Resumen del turno' })
  resumenTurno(@Param('id', ParseIntPipe) id: number) { return this.svc.resumenTurno(id); }

  @Get('turnos/:id/pdf')
  @ApiOperation({ summary: 'PDF de cierre de turno' })
  async pdfTurno(@Param('id', ParseIntPipe) id: number, @Res() res: Response) {
    const resumen = await this.svc.resumenTurno(id);
    const buffer = await this.pdfSvc.generarCierreTurno(resumen);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="turno-${resumen.turno.numero}.pdf"` });
    res.end(buffer);
  }

  // ── REPORTES ──────────────────────────────────────────────────────────────
  @Get('reportes/ventas')
  @ApiOperation({ summary: 'Reporte de ventas por período' })
  reporteVentas(@Query('desde') desde: string, @Query('hasta') hasta: string) {
    return this.svc.reporteVentas(desde, hasta);
  }
}
