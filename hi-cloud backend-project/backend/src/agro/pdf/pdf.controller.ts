import { Controller, Get, Param, ParseIntPipe, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../tenant/tenant.guard';
import { ModuloAddonGuard } from '../../modulos-addon/guards/modulo-addon.guard';
import { TenantService } from '../../tenant/tenant.service';
import { AgroPdfService } from './agro-pdf.service';

@Controller('agro/pdf')
@UseGuards(JwtAuthGuard, TenantGuard, ModuloAddonGuard('agro'))
export class AgroPdfController {
  constructor(private readonly svc: AgroPdfService, private readonly tenantSvc: TenantService) {}
  private get empresaId() { return this.tenantSvc.getEmpresaId(); }

  private send(res: Response, buf: Buffer, nombre: string) {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${nombre}.pdf"`);
    res.send(buf);
  }

  @Get('trazabilidad/:cicloId')
  async trazabilidad(@Param('cicloId', ParseIntPipe) id: number, @Res() res: Response) {
    const buf = await this.svc.trazabilidadCiclo(this.empresaId, id);
    this.send(res, buf, `trazabilidad-${id}`);
  }

  @Get('costos/:cicloId')
  async costos(@Param('cicloId', ParseIntPipe) id: number, @Res() res: Response) {
    const buf = await this.svc.costosCiclo(this.empresaId, id);
    this.send(res, buf, `costos-ciclo-${id}`);
  }

  @Get('animal/:animalId')
  async fichaAnimal(@Param('animalId', ParseIntPipe) id: number, @Res() res: Response) {
    const buf = await this.svc.fichaAnimal(this.empresaId, id);
    this.send(res, buf, `ficha-animal-${id}`);
  }

  @Get('inventario-insumos')
  async inventario(@Res() res: Response) {
    const buf = await this.svc.inventarioInsumos(this.empresaId);
    this.send(res, buf, 'inventario-insumos');
  }
}
