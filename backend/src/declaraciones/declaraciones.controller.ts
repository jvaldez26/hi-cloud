import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { DeclaracionesService } from './declaraciones.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { generar606XML, generar607XML, generar608XML } from './dgii-xml.generator';

@ApiTags('Declaraciones Fiscales DGII')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.CONTADOR)
@Controller('declaraciones')
export class DeclaracionesController {
  constructor(private svc: DeclaracionesService) {}

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
}
