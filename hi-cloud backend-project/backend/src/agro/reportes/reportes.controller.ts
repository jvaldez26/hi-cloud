import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../tenant/tenant.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../users/enums/user-role.enum';
import { ModuloAddonGuard } from '../../modulos-addon/guards/modulo-addon.guard';
import { TenantService } from '../../tenant/tenant.service';
import { AgroReportesService } from './reportes.service';

@Controller('agro/reportes')
@UseGuards(JwtAuthGuard, RolesGuard, TenantGuard, ModuloAddonGuard('agro'))
@Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR, UserRole.VIEWER)
export class AgroReportesController {
  constructor(private readonly svc: AgroReportesService, private readonly tenantSvc: TenantService) {}
  private get empresaId() { return this.tenantSvc.getEmpresaId(); }

  private csv(res: Response, nombre: string, contenido: string) {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${nombre}.csv"`);
    res.send(contenido);
  }

  @Get('rentabilidad-ciclos')
  async rent(@Res() res: Response) { this.csv(res, 'rentabilidad-ciclos', await this.svc.rentabilidadCiclos(this.empresaId)); }

  @Get('rendimiento-cultivos')
  async rend(@Res() res: Response) { this.csv(res, 'rendimiento-cultivos', await this.svc.rendimientoCultivos(this.empresaId)); }

  @Get('costos-por-categoria')
  async costos(@Query() q: any, @Res() res: Response) { this.csv(res, 'costos-categoria', await this.svc.costosPorCategoria(this.empresaId, q)); }

  @Get('produccion-leche')
  async leche(@Query() q: any, @Res() res: Response) { this.csv(res, 'produccion-leche', await this.svc.produccionLeche(this.empresaId, q)); }

  @Get('inventario-animales')
  async animales(@Res() res: Response) { this.csv(res, 'inventario-animales', await this.svc.inventarioAnimales(this.empresaId)); }

  @Get('trazabilidad-insumos')
  async traz(@Query() q: any, @Res() res: Response) { this.csv(res, 'trazabilidad-insumos', await this.svc.trazabilidadInsumos(this.empresaId, q)); }

  @Get('consumo-insumos-ciclo')
  async consumo(@Res() res: Response) { this.csv(res, 'consumo-insumos', await this.svc.consumoInsumosPorCiclo(this.empresaId)); }

  @Get('calendario-sanitario')
  async sanitario(@Res() res: Response) { this.csv(res, 'calendario-sanitario', await this.svc.calendarioSanitario(this.empresaId)); }

  @Get('uso-maquinaria')
  async maq(@Res() res: Response) { this.csv(res, 'uso-maquinaria', await this.svc.usoCostoMaquinaria(this.empresaId)); }

  @Get('proyeccion-cosechas')
  async proyeccion(@Query() q: any, @Res() res: Response) { this.csv(res, 'proyeccion-cosechas', await this.svc.proyeccionCosechas(this.empresaId, q)); }

  @Get('comparativo-parcelas')
  async parcelas(@Res() res: Response) { this.csv(res, 'comparativo-parcelas', await this.svc.comparativoParcelas(this.empresaId)); }

  @Get('stock-insumos')
  async stock(@Res() res: Response) { this.csv(res, 'stock-insumos', await this.svc.stockInsumos(this.empresaId)); }
}
