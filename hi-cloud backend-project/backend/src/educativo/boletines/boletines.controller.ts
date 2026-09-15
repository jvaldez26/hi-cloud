import {
  Controller, Get, Post, Body, Param, ParseIntPipe, Query,
  UseGuards, Res, BadRequestException,
} from '@nestjs/common';
import type { Response } from 'express';
import { Logger } from '@nestjs/common';
import { BoletinesService } from './boletines.service';
import { BoletinPdfService } from './boletin-pdf.service';
import { CalcularNotasPeriodoDto } from './dto/boletines.dto';
import { JwtAuthGuard }     from '../../auth/guards/jwt-auth.guard';
import { RolesGuard }       from '../../auth/guards/roles.guard';
import { TenantGuard }      from '../../tenant/tenant.guard';
import { ModuloAddonGuard } from '../../modulos-addon/guards/modulo-addon.guard';
import { TenantService }    from '../../tenant/tenant.service';

// Una sección real no llega a esto (capacidadMaxima por defecto es 30), pero
// si algún día se generan boletines por otro agrupador más grande, 150
// páginas de PDFKit en un solo request es un techo razonable antes de pedir
// que se genere por partes.
const LIMITE_BOLETINES_MASIVO = 150;
const UMBRAL_LENTO_MS = 8000;

@UseGuards(JwtAuthGuard, RolesGuard, TenantGuard, ModuloAddonGuard('educativo'))
@Controller('educativo')
export class BoletinesController {
  private readonly logger = new Logger(BoletinesController.name);

  constructor(
    private readonly svc:    BoletinesService,
    private readonly pdfSvc: BoletinPdfService,
    private readonly tenantSvc: TenantService,
  ) {}

  private get empresaId() { return this.tenantSvc.getEmpresaId(); }

  // ── Consolidación ─────────────────────────────────────────────────────────

  @Post('notas-periodo/calcular')
  calcular(@Body() dto: CalcularNotasPeriodoDto) {
    return this.svc.calcularNotasPeriodo(this.empresaId, dto.seccionId, dto.periodoId);
  }

  @Get('notas-periodo/resumen')
  resumen(@Query('seccionId') seccionId: string, @Query('periodoId') periodoId: string) {
    if (!seccionId || !periodoId) throw new BadRequestException('seccionId y periodoId son requeridos');
    return this.svc.resumenSeccion(this.empresaId, Number(seccionId), Number(periodoId));
  }

  // ── PDF individual ───────────────────────────────────────────────────────
  //
  // @Res() SIN passthrough (no StreamableFile): el ResponseInterceptor
  // global envuelve todo lo que un handler RETORNA en {success,data,
  // timestamp} — incluido un StreamableFile, que deja de ser reconocido
  // como tal una vez envuelto y termina serializado como JSON del buffer
  // byte a byte en vez de enviarse como PDF binario. res.send(buf) directo
  // evita el interceptor por completo — mismo patrón que agro/pdf/
  // pdf.controller.ts (el que sí funciona en producción).

  @Get('estudiantes/:id/boletin-pdf')
  async boletinIndividual(
    @Param('id', ParseIntPipe) id: number,
    @Query('periodoId', ParseIntPipe) periodoId: number,
    @Res() res: Response,
  ) {
    const datos = await this.svc.datosBoletin(this.empresaId, id, periodoId);
    const buffer = await this.pdfSvc.boletinIndividual(datos);
    const nombreArchivo = `boletin-${datos.estudiante.apellidos}-${datos.estudiante.nombres}`.replace(/\s+/g, '_');
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${nombreArchivo}.pdf"` });
    res.send(buffer);
  }

  // ── PDF masivo por sección ───────────────────────────────────────────────

  @Get('secciones/:id/boletines-pdf')
  async boletinesMasivo(
    @Param('id', ParseIntPipe) id: number,
    @Query('periodoId', ParseIntPipe) periodoId: number,
    @Res() res: Response,
  ) {
    const empresaId = this.empresaId;
    const estudiantes = await this.svc.estudiantesDeSeccion(empresaId, id);
    if (!estudiantes.length) throw new BadRequestException('La sección no tiene estudiantes matriculados');
    if (estudiantes.length > LIMITE_BOLETINES_MASIVO) {
      throw new BadRequestException(
        `La sección tiene ${estudiantes.length} estudiantes — el máximo por petición es ${LIMITE_BOLETINES_MASIVO}. Divide la generación en grupos.`,
      );
    }

    const inicio = Date.now();
    const listaDatos = await Promise.all(
      estudiantes.map((e: any) => this.svc.datosBoletin(empresaId, e.id, periodoId)),
    );
    const buffer = await this.pdfSvc.boletinesMasivo(listaDatos);
    const duracionMs = Date.now() - inicio;
    if (duracionMs > UMBRAL_LENTO_MS) {
      this.logger.warn(`Generación de ${estudiantes.length} boletines de la sección #${id} tardó ${duracionMs}ms`);
    }

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="boletines-seccion-${id}.pdf"`,
      'X-Duracion-Ms': String(duracionMs),
    });
    res.send(buffer);
  }
}
