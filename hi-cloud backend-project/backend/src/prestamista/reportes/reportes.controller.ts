import { Controller, Get, Query, Param, ParseIntPipe, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../tenant/tenant.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../users/enums/user-role.enum';
import { ModuloAddonGuard } from '../../modulos-addon/guards/modulo-addon.guard';
import { TenantService } from '../../tenant/tenant.service';
import { ReportesPrestamistaService } from './reportes.service';

@Controller('prestamista/reportes')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard, ModuloAddonGuard('prestamista'))
@Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR, UserRole.VIEWER)
export class ReportesController {
  constructor(
    private readonly svc: ReportesPrestamistaService,
    private readonly tenantSvc: TenantService,
  ) {}

  private get empresaId() { return this.tenantSvc.getEmpresaId(); }

  private csv(res: Response, nombre: string, contenido: string) {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${nombre}.csv"`);
    res.send(contenido);
  }

  @Get('cartera-activa')
  async carteraActiva(@Query() q: any, @Res() res: Response) {
    const csv = await this.svc.carteraActiva(this.empresaId, q);
    this.csv(res, 'cartera-activa', csv);
  }

  @Get('cartera-mora')
  async carteraMora(@Query() q: any, @Res() res: Response) {
    const csv = await this.svc.carteraMora(this.empresaId, q);
    this.csv(res, 'cartera-mora', csv);
  }

  @Get('flujo-cobros')
  async flujoCobros(@Query() q: any, @Res() res: Response) {
    const csv = await this.svc.flujoCobros(this.empresaId, q);
    this.csv(res, 'flujo-cobros', csv);
  }

  @Get('proyeccion-cobros')
  async proyeccionCobros(@Query() q: any, @Res() res: Response) {
    const csv = await this.svc.proyeccionCobros(this.empresaId, q);
    this.csv(res, 'proyeccion-cobros', csv);
  }

  @Get('por-producto')
  async porProducto(@Res() res: Response) {
    const csv = await this.svc.prestamosPorProducto(this.empresaId);
    this.csv(res, 'prestamos-por-producto', csv);
  }

  @Get('garantias')
  async garantias(@Res() res: Response) {
    const csv = await this.svc.garantias(this.empresaId);
    this.csv(res, 'garantias', csv);
  }

  @Get('gestiones-cobranza')
  async gestiones(@Query() q: any, @Res() res: Response) {
    const csv = await this.svc.gestiones(this.empresaId, q);
    this.csv(res, 'gestiones-cobranza', csv);
  }

  @Get('deudores-saldos')
  async deudoresSaldos(@Res() res: Response) {
    const csv = await this.svc.deudoresSaldos(this.empresaId);
    this.csv(res, 'deudores-saldos', csv);
  }

  @Get('refinanciamientos')
  async refinanciamientos(@Res() res: Response) {
    const csv = await this.svc.refinanciamientos(this.empresaId);
    this.csv(res, 'refinanciamientos', csv);
  }

  @Get('indices-financieros')
  async indicesFinancieros(@Res() res: Response) {
    const csv = await this.svc.indicesFinancieros(this.empresaId);
    this.csv(res, 'indices-financieros', csv);
  }

  @Get('cuotas-vencidas')
  async cuotasVencidas(@Res() res: Response) {
    const csv = await this.svc.cuotasVencidas(this.empresaId);
    this.csv(res, 'cuotas-vencidas', csv);
  }

  @Get('estado-cuenta-deudor/:deudorId')
  async estadoCuentaDeudor(@Param('deudorId', ParseIntPipe) deudorId: number, @Res() res: Response) {
    const csv = await this.svc.estadoCuentaDeudor(this.empresaId, deudorId);
    this.csv(res, `estado-cuenta-deudor-${deudorId}`, csv);
  }
}
