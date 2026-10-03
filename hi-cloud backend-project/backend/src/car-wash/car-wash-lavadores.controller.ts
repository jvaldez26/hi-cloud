import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../tenant/tenant.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { ModuloAddonGuard } from '../modulos-addon/guards/modulo-addon.guard';
import { TenantService } from '../tenant/tenant.service';
import { UserRole } from '../users/enums/user-role.enum';
import { User } from '../users/users.entity';
import { CwLavadoresService } from './services/cw-lavadores.service';
import { CwAdelantosService } from './services/cw-adelantos.service';
import { CwLiquidacionesService } from './services/cw-liquidaciones.service';
import { CwComisionesService } from './services/cw-comisiones.service';
import { CrearLavadorDto, ActualizarLavadorDto } from './dto/lavador.dto';
import { CrearAdelantoDto } from './dto/adelanto.dto';
import { RegistrarPagoLavadorDto } from './dto/liquidacion.dto';

const ROLES_OPERATIVOS = [UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR];

@Controller('car-wash')
@UseGuards(JwtAuthGuard, TenantGuard, ModuloAddonGuard('car_wash'), RolesGuard)
@ApiTags('Car Wash — Lavadores y Pagos')
@ApiBearerAuth()
export class CarWashLavadoresController {
  constructor(
    private readonly tenantSvc: TenantService,
    private readonly lavadoresSvc: CwLavadoresService,
    private readonly adelantosSvc: CwAdelantosService,
    private readonly liquidacionesSvc: CwLiquidacionesService,
    private readonly comisionesSvc: CwComisionesService,
  ) {}

  private get empresaId() { return this.tenantSvc.getEmpresaId(); }

  // ── Lavadores — alta/edición solo ADMIN, listar lo ve todo el equipo ────

  @Get('lavadores')
  @Roles(...ROLES_OPERATIVOS)
  listarLavadores(@Query('activos') activos?: string) {
    return this.lavadoresSvc.listar(this.empresaId, activos === 'true');
  }

  @Post('lavadores')
  @Roles(UserRole.ADMIN)
  crearLavador(@Body() dto: CrearLavadorDto) {
    return this.lavadoresSvc.crear(this.empresaId, dto);
  }

  @Patch('lavadores/:id')
  @Roles(UserRole.ADMIN)
  actualizarLavador(@Param('id', ParseIntPipe) id: number, @Body() dto: ActualizarLavadorDto) {
    return this.lavadoresSvc.actualizar(this.empresaId, id, dto);
  }

  // ── Comisiones ───────────────────────────────────────────────────────

  @Get('turnos/:id/comisiones')
  @Roles(...ROLES_OPERATIVOS)
  comisionesDeTurno(@Param('id', ParseIntPipe) id: number) {
    return this.comisionesSvc.porTurno(this.empresaId, id);
  }

  @Patch('comisiones/:id/anular')
  @Roles(UserRole.ADMIN)
  anularComision(@Param('id', ParseIntPipe) id: number, @Body('motivo') motivo: string, @GetUser() usuario: User) {
    return this.comisionesSvc.anular(this.empresaId, id, motivo, usuario.id);
  }

  // ── Adelantos (vales) — ADMIN, mueve efectivo real ──────────────────────

  @Post('adelantos')
  @Roles(UserRole.ADMIN)
  crearAdelanto(@Body() dto: CrearAdelantoDto, @GetUser() usuario: User) {
    return this.adelantosSvc.crear(this.empresaId, dto, usuario.id);
  }

  // ── Liquidación de pagos a lavadores — ADMIN ────────────────────────────

  @Get('liquidaciones/reporte')
  @Roles(UserRole.ADMIN)
  reportePorLavador(@Query('desde') desde: string, @Query('hasta') hasta: string) {
    return this.liquidacionesSvc.reportePorLavador(this.empresaId, desde, hasta);
  }

  @Get('liquidaciones/resumen')
  @Roles(UserRole.ADMIN)
  resumenLiquidacion(
    @Query('lavadorId', ParseIntPipe) lavadorId: number,
    @Query('desde') desde: string,
    @Query('hasta') hasta: string,
  ) {
    return this.liquidacionesSvc.resumen(this.empresaId, lavadorId, desde, hasta);
  }

  @Post('liquidaciones')
  @Roles(UserRole.ADMIN)
  registrarPago(@Body() dto: RegistrarPagoLavadorDto, @GetUser() usuario: User) {
    return this.liquidacionesSvc.registrarPago(this.empresaId, dto, usuario.id);
  }
}
