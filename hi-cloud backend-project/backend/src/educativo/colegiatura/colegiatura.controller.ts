import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards, ParseIntPipe } from '@nestjs/common';
import { ColegiaturaService } from './colegiatura.service';
import { JwtAuthGuard }     from '../../auth/guards/jwt-auth.guard';
import { RolesGuard }       from '../../auth/guards/roles.guard';
import { TenantGuard }      from '../../tenant/tenant.guard';
import { ModuloAddonGuard } from '../../modulos-addon/guards/modulo-addon.guard';
import { TenantService }    from '../../tenant/tenant.service';

@UseGuards(JwtAuthGuard, RolesGuard, TenantGuard, ModuloAddonGuard('educativo'))
@Controller('educativo/colegiatura')
export class ColegiaturaController {
  constructor(
    private readonly svc: ColegiaturaService,
    private readonly tenantSvc: TenantService,
  ) {}

  @Get('resumen')
  resumen(@Query('anioEscolarId') anioId?: string) {
    return this.svc.resumenFinanciero(this.tenantSvc.getEmpresaId(), anioId ? Number(anioId) : undefined);
  }

  // ── Planes ──────────────────────────────────────────────────────────────────

  @Get('planes')
  listPlanes(@Query('anioEscolarId') anioId?: string) {
    return this.svc.listPlanes(this.tenantSvc.getEmpresaId(), anioId ? Number(anioId) : undefined);
  }

  @Post('planes')
  upsertPlan(@Body() dto: any) {
    return this.svc.upsertPlan(this.tenantSvc.getEmpresaId(), dto);
  }

  @Post('planes/:id/generar-cargos')
  generarCargos(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { meses: number[]; anio: number },
  ) {
    return this.svc.generarCargos(this.tenantSvc.getEmpresaId(), id, body.meses, body.anio);
  }

  @Post('planes/:id/generar-matricula')
  generarMatricula(@Param('id', ParseIntPipe) id: number, @Body() body: { anio: number }) {
    return this.svc.generarMatricula(this.tenantSvc.getEmpresaId(), id, body.anio);
  }

  // ── Cargos ──────────────────────────────────────────────────────────────────

  @Get('cargos')
  listCargos(
    @Query('estudianteId') estudianteId?: string,
    @Query('estado')       estado?: string,
    @Query('mes')          mes?: string,
    @Query('anio')         anio?: string,
    @Query('planPagoId')   planPagoId?: string,
    @Query('vencidos')     vencidos?: string,
    @Query('q')            q?: string,
  ) {
    return this.svc.listCargos(this.tenantSvc.getEmpresaId(), {
      estudianteId: estudianteId ? Number(estudianteId) : undefined,
      estado,
      mes:          mes          ? Number(mes)          : undefined,
      anio:         anio         ? Number(anio)         : undefined,
      planPagoId:   planPagoId   ? Number(planPagoId)   : undefined,
      vencidos:     vencidos === 'true',
      q,
    });
  }

  @Post('cargos')
  addCargo(@Body() dto: any) {
    return this.svc.addCargo(this.tenantSvc.getEmpresaId(), dto);
  }

  @Patch('cargos/:id')
  updateCargo(@Param('id', ParseIntPipe) id: number, @Body() dto: any) {
    return this.svc.updateCargo(this.tenantSvc.getEmpresaId(), id, dto);
  }

  // ── Pagos ───────────────────────────────────────────────────────────────────

  @Get('pagos')
  listPagos(
    @Query('estudianteId') estudianteId?: string,
    @Query('fechaInicio')  fechaInicio?: string,
    @Query('fechaFin')     fechaFin?: string,
  ) {
    return this.svc.listPagos(this.tenantSvc.getEmpresaId(), {
      estudianteId: estudianteId ? Number(estudianteId) : undefined,
      fechaInicio,
      fechaFin,
    });
  }

  @Post('pagos')
  registrarPago(@Body() dto: any) {
    return this.svc.registrarPago(this.tenantSvc.getEmpresaId(), dto);
  }
}
