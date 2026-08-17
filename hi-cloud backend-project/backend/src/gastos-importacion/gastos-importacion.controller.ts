import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, ParseIntPipe, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { GastosImportacionService } from './gastos-importacion.service';
import { CrearGastoImportacionDto } from './dto/crear-gasto-importacion.dto';
import { AjustarLineasDto } from './dto/ajustar-lineas.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('gastos-importacion')
export class GastosImportacionController {
  constructor(private readonly svc: GastosImportacionService) {}

  // ── CRUD ────────────────────────────────────────────────────────────────────

  @Post()
  create(@Body() dto: CrearGastoImportacionDto) {
    return this.svc.create(dto);
  }

  @Get('compra/:compraId')
  findByCompra(@Param('compraId', ParseIntPipe) compraId: number) {
    return this.svc.findByCompra(compraId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(@Param('id', ParseIntPipe) id: number) {
    return this.svc.delete(id);
  }

  // ── Vista previa del prorrateo ───────────────────────────────────────────────

  /**
   * Devuelve el reparto calculado para un gasto sin aplicarlo.
   * El frontend muestra esta tabla al usuario antes de confirmar.
   */
  @Get(':id/preview')
  preview(@Param('id', ParseIntPipe) id: number) {
    return this.svc.preview(id);
  }

  // ── Ajuste manual de líneas ──────────────────────────────────────────────────

  /**
   * El usuario puede redistribuir los montos manualmente.
   * La suma de lineas[].montoAsignado debe ser ≈ gasto.montoDOP (tolerancia 0.02 DOP).
   * Devuelve el preview actualizado.
   */
  @Patch(':id/lineas')
  ajustarLineas(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AjustarLineasDto,
  ) {
    return this.svc.ajustarLineas(id, dto);
  }

  // ── Trazabilidad ─────────────────────────────────────────────────────────────

  /**
   * Desglose por línea de compra: precio proveedor + cada gasto asignado = costo final.
   * Incluye tanto gastos aplicados como pendientes.
   */
  @Get('compra/:compraId/desglose')
  desglose(@Param('compraId', ParseIntPipe) compraId: number) {
    return this.svc.desglosePorCompra(compraId);
  }
}
