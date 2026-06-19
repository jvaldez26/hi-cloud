import { Controller, Get, Param, ParseIntPipe, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../tenant/tenant.guard';
import { ModuloAddonGuard } from '../../modulos-addon/guards/modulo-addon.guard';
import { TenantService } from '../../tenant/tenant.service';
import { PrestamistaPdfService } from './prestamista-pdf.service';

@Controller('prestamista/pdf')
@UseGuards(JwtAuthGuard, TenantGuard, ModuloAddonGuard('prestamista'))
@ApiTags('Prestamista - PDF')
@ApiBearerAuth()
export class PdfPrestamistaController {
  constructor(private readonly pdfSvc: PrestamistaPdfService, private readonly tenantSvc: TenantService) {}
  private get empresaId() { return this.tenantSvc.getEmpresaId(); }

  @Get('amortizacion/:prestamoId')
  tablaAmortizacion(@Param('prestamoId', ParseIntPipe) id: number, @Res() res: Response) {
    return this.pdfSvc.tablaAmortizacion(res, id, this.empresaId);
  }

  @Get('recibo/:pagoId')
  reciboPago(@Param('pagoId', ParseIntPipe) id: number, @Res() res: Response) {
    return this.pdfSvc.reciboPago(res, id, this.empresaId);
  }

  @Get('estado-cuenta/:deudorId')
  estadoCuenta(@Param('deudorId', ParseIntPipe) id: number, @Res() res: Response) {
    return this.pdfSvc.estadoCuenta(res, id, this.empresaId);
  }
}
