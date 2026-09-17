import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards, ParseIntPipe } from '@nestjs/common';
import { ColegiaturaService } from './colegiatura.service';
import {
  UpsertPlanDto, GenerarCargosDto, GenerarMatriculaDto,
  AddCargoDto, UpdateCargoDto, RegistrarPagoDto, CondonarMoraDto, AnularPagoDto,
} from './dto/colegiatura.dto';
import { JwtAuthGuard }     from '../../auth/guards/jwt-auth.guard';
import { RolesGuard }       from '../../auth/guards/roles.guard';
import { TenantGuard }      from '../../tenant/tenant.guard';
import { ModuloAddonGuard } from '../../modulos-addon/guards/modulo-addon.guard';
import { TenantService }    from '../../tenant/tenant.service';
import { GetUser }          from '../../auth/decorators/get-user.decorator';

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
  upsertPlan(@Body() dto: UpsertPlanDto) {
    return this.svc.upsertPlan(this.tenantSvc.getEmpresaId(), dto);
  }

  @Post('planes/:id/generar-cargos')
  generarCargos(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: GenerarCargosDto,
  ) {
    return this.svc.generarCargos(this.tenantSvc.getEmpresaId(), id, body.meses, body.anio);
  }

  @Post('planes/:id/generar-matricula')
  generarMatricula(@Param('id', ParseIntPipe) id: number, @Body() body: GenerarMatriculaDto) {
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
  addCargo(@Body() dto: AddCargoDto) {
    return this.svc.addCargo(this.tenantSvc.getEmpresaId(), dto);
  }

  @Patch('cargos/:id')
  updateCargo(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateCargoDto) {
    return this.svc.updateCargo(this.tenantSvc.getEmpresaId(), id, dto);
  }

  @Post('cargos/:id/condonar-mora')
  condonarMora(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CondonarMoraDto,
    @GetUser('id') usuarioId: number,
  ) {
    return this.svc.condonarMora(this.tenantSvc.getEmpresaId(), id, dto, usuarioId);
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
  registrarPago(@Body() dto: RegistrarPagoDto) {
    return this.svc.registrarPago(this.tenantSvc.getEmpresaId(), dto);
  }

  @Post('pagos/:id/anular')
  anularPago(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AnularPagoDto,
    @GetUser('id') usuarioId: number,
  ) {
    return this.svc.anularPago(this.tenantSvc.getEmpresaId(), id, dto, usuarioId);
  }
}
