import { Controller, Get, Post, Body, Query, Res, Param, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { DeclaracionesService } from './declaraciones.service';
import { DeclaracionesPdfService } from './declaraciones-pdf.service';
import { DgiiTxtGeneratorService } from './dgii-txt.generator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { User } from '../users/users.entity';
import { generar606XML, generar607XML, generar608XML } from './dgii-xml.generator';
import { IsEnum, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

class ValidarDto {
  @IsEnum(['606','607','608']) tipo: '606'|'607'|'608';
  @IsInt() @Min(1) @Max(12) @Type(() => Number) mes: number;
  @IsInt() @Min(2020) @Type(() => Number) anio: number;
}

@ApiTags('Declaraciones Fiscales DGII')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.CONTADOR)
@Controller('declaraciones')
export class DeclaracionesController {
  constructor(
    private svc: DeclaracionesService,
    private pdf: DeclaracionesPdfService,
    private txt: DgiiTxtGeneratorService,
  ) {}

  @Get('it1')
  @ApiOperation({ summary: 'IT-1: Declaración mensual de ITBIS' })
  getIT1(@Query('mes') mes: string, @Query('anio') anio: string) {
    return this.svc.getIT1(Number(mes), Number(anio));
  }

  @Get('formato606')
  @ApiOperation({ summary: 'Formato 606: Reporte de compras (JSON)' })
  getFormato606(@Query('mes') mes: string, @Query('anio') anio: string) {
    return this.svc.getFormato606(Number(mes), Number(anio));
  }

  @Get('formato606/xml')
  @ApiOperation({ summary: 'Formato 606: Descarga XML para portal DGII' })
  async getFormato606XML(
    @Query('mes') mes: string,
    @Query('anio') anio: string,
    @Res() res: Response,
  ) {
    const data = await this.svc.getFormato606(Number(mes), Number(anio));
    const rnc  = await this.svc.getRnc();
    const xml  = generar606XML({ ...data, rnc });
    const filename = `606_${data.rnc ?? 'empresa'}_${anio}${String(mes).padStart(2,'0')}.xml`;
    res.setHeader('Content-Type', 'application/xml; charset=UTF-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(xml);
  }

  @Get('formato607')
  @ApiOperation({ summary: 'Formato 607: Reporte de ventas (JSON)' })
  getFormato607(@Query('mes') mes: string, @Query('anio') anio: string) {
    return this.svc.getFormato607(Number(mes), Number(anio));
  }

  @Get('formato607/xml')
  @ApiOperation({ summary: 'Formato 607: Descarga XML para portal DGII' })
  async getFormato607XML(
    @Query('mes') mes: string,
    @Query('anio') anio: string,
    @Res() res: Response,
  ) {
    const data = await this.svc.getFormato607(Number(mes), Number(anio));
    const rnc  = await this.svc.getRnc();
    const xml  = generar607XML({ ...data, rnc });
    const filename = `607_${rnc ?? 'empresa'}_${anio}${String(mes).padStart(2,'0')}.xml`;
    res.setHeader('Content-Type', 'application/xml; charset=UTF-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(xml);
  }

  @Get('formato608')
  @ApiOperation({ summary: 'Formato 608: Comprobantes anulados (JSON)' })
  getFormato608(@Query('mes') mes: string, @Query('anio') anio: string) {
    return this.svc.getFormato608(Number(mes), Number(anio));
  }

  @Get('formato608/xml')
  @ApiOperation({ summary: 'Formato 608: Descarga XML para portal DGII' })
  async getFormato608XML(
    @Query('mes') mes: string,
    @Query('anio') anio: string,
    @Res() res: Response,
  ) {
    const data = await this.svc.getFormato608(Number(mes), Number(anio));
    const rnc  = await this.svc.getRnc();
    // Adaptar estructura del 608 al generador XML
    const filas608 = (data as any).comprobantes ?? (data as any).filas ?? [];
    const xml  = generar608XML({ periodo: { mes: Number(mes), anio: Number(anio) }, rnc, filas: filas608 });
    const filename = `608_${rnc ?? 'empresa'}_${anio}${String(mes).padStart(2,'0')}.xml`;
    res.setHeader('Content-Type', 'application/xml; charset=UTF-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(xml);
  }

  // ── PDF endpoints ─────────────────────────────────────────────────────────

  @Get('formato606/pdf')
  @ApiOperation({ summary: 'Formato 606: PDF para impresión/archivo' })
  async getFormato606PDF(@Query('mes') mes: string, @Query('anio') anio: string, @Res() res: Response) {
    const buf = await this.pdf.generar606(Number(mes), Number(anio));
    const filename = `606_${anio}${String(mes).padStart(2,'0')}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buf);
  }

  @Get('formato607/pdf')
  @ApiOperation({ summary: 'Formato 607: PDF para impresión/archivo' })
  async getFormato607PDF(@Query('mes') mes: string, @Query('anio') anio: string, @Res() res: Response) {
    const buf = await this.pdf.generar607(Number(mes), Number(anio));
    const filename = `607_${anio}${String(mes).padStart(2,'0')}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buf);
  }

  @Get('formato608/pdf')
  @ApiOperation({ summary: 'Formato 608: PDF para impresión/archivo' })
  async getFormato608PDF(@Query('mes') mes: string, @Query('anio') anio: string, @Res() res: Response) {
    const buf = await this.pdf.generar608(Number(mes), Number(anio));
    const filename = `608_${anio}${String(mes).padStart(2,'0')}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buf);
  }

  @Get('it1/pdf')
  @ApiOperation({ summary: 'IT-1: PDF para impresión/archivo' })
  async getIT1PDF(@Query('mes') mes: string, @Query('anio') anio: string, @Res() res: Response) {
    const buf = await this.pdf.generarIT1(Number(mes), Number(anio));
    const filename = `IT1_${anio}${String(mes).padStart(2,'0')}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buf);
  }

  // ── Data endpoints ─────────────────────────────────────────────────────────

  @Get('ir17')
  @ApiOperation({ summary: 'IR-17: Retenciones del período' })
  getIR17(@Query('mes') mes: string, @Query('anio') anio: string) {
    return this.svc.getIR17(Number(mes), Number(anio));
  }

  @Get('resumen-anual')
  @ApiOperation({ summary: 'Resumen anual de cumplimiento fiscal' })
  getResumenAnual(@Query('anio') anio: string) {
    return this.svc.getResumenAnual(Number(anio));
  }

  // ── NUEVOS: Validación, TXT oficial, Historial ────────────────────────────

  @Post('validar')
  @ApiOperation({ summary: 'Validar período antes de exportar (sin generar archivo)' })
  validar(@Body() dto: ValidarDto) {
    return this.svc.validarPeriodo(dto.tipo, dto.mes, dto.anio);
  }

  @Get('formato606/txt')
  @ApiOperation({ summary: 'Formato 606: TXT oficial DGII (pipe-delimited)' })
  async get606Txt(@Query('mes') mes: string, @Query('anio') anio: string,
                  @Res() res: Response, @GetUser() user: User) {
    const { content, filename } = await this.txt.generar606Txt(
      Number(mes), Number(anio), user.id,
    );
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(content);
  }

  @Get('formato607/txt')
  @ApiOperation({ summary: 'Formato 607: TXT oficial DGII (pipe-delimited)' })
  async get607Txt(@Query('mes') mes: string, @Query('anio') anio: string,
                  @Res() res: Response, @GetUser() user: User) {
    const { content, filename } = await this.txt.generar607Txt(
      Number(mes), Number(anio), user.id,
    );
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(content);
  }

  @Get('formato608/txt')
  @ApiOperation({ summary: 'Formato 608: TXT oficial DGII (pipe-delimited)' })
  async get608Txt(@Query('mes') mes: string, @Query('anio') anio: string,
                  @Res() res: Response, @GetUser() user: User) {
    const { content, filename } = await this.txt.generar608Txt(
      Number(mes), Number(anio), user.id,
    );
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(content);
  }

  @Get('historial')
  @ApiOperation({ summary: 'Historial de reportes DGII generados' })
  getHistorial() {
    return this.svc.getHistorial();
  }

  @Get('historial/:id/txt')
  @ApiOperation({ summary: 'Descargar un reporte histórico por ID' })
  async getHistorialTxt(@Param('id') id: string, @Res() res: Response) {
    const reporte = await this.svc.getReporteById(Number(id));
    if (!reporte?.contenido) { res.status(404).send('No encontrado'); return; }
    const periodo = `${reporte.anio}${String(reporte.mes).padStart(2,'0')}`;
    const filename = `${reporte.tipo}_${periodo}.txt`;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(reporte.contenido);
  }
}
