import { PlanGuard } from '../suscripciones/guards/plan.guard';
import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { ContabilidadService } from './services/contabilidad.service';
import { CreateCuentaContableDto } from './dto/create-cuenta-contable.dto';
import { UpdateCuentaContableDto } from './dto/update-cuenta-contable.dto';
import { CreateAsientoDto } from './dto/create-asiento.dto';
import { FiltroContabilidadDto } from './dto/filtro-contabilidad.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { User } from '../users/users.entity';
import { RequiereModulo } from '../suscripciones/decorators/requiere-modulo.decorator';

@ApiTags('Contabilidad General')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@UseGuards(PlanGuard)
@RequiereModulo('contabilidad')
@Controller('contabilidad')
export class ContabilidadController {
  constructor(private contabilidadService: ContabilidadService) {}

  // ── Plan de Cuentas ────────────────────────────────────────────────────────

  @Get('cuentas')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Plan de Cuentas dominicano completo' })
  @ApiQuery({ name: 'soloMovimientos', required: false, type: Boolean })
  getCuentas(@Query('soloMovimientos') soloMovimientos?: string) {
    return this.contabilidadService.getCuentas(soloMovimientos === 'true');
  }

  @Post('cuentas')
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Crear nueva cuenta contable' })
  createCuenta(@Body() dto: CreateCuentaContableDto) {
    return this.contabilidadService.createCuenta(dto);
  }

  @Get('cuentas/:id')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Obtener cuenta contable por ID' })
  findCuenta(@Param('id', ParseIntPipe) id: number) {
    return this.contabilidadService.findCuentaById(id);
  }

  @Patch('cuentas/:id')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Actualizar cuenta contable' })
  updateCuenta(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCuentaContableDto,
  ) {
    return this.contabilidadService.updateCuenta(id, dto);
  }

  @Delete('cuentas/:id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Eliminar cuenta contable (solo sin movimientos)' })
  removeCuenta(@Param('id', ParseIntPipe) id: number) {
    return this.contabilidadService.removeCuenta(id);
  }

  // ── Asientos Contables ─────────────────────────────────────────────────────

  @Post('asientos')
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Crear asiento manual (validación de cuadre automática)' })
  createAsiento(@Body() dto: CreateAsientoDto, @GetUser() usuario: User) {
    return this.contabilidadService.createAsiento(dto, usuario.id);
  }

  @Get('asientos')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Listar asientos con filtros (fecha, tipo, estado)' })
  getAsientos(@Query() filtro: FiltroContabilidadDto) {
    return this.contabilidadService.getAsientos(filtro);
  }

  @Get('asientos/:id')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Detalle de asiento con todas sus líneas' })
  findAsiento(@Param('id', ParseIntPipe) id: number) {
    return this.contabilidadService.findAsientoById(id);
  }

  @Patch('asientos/:id/contabilizar')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Contabilizar asiento en borrador (lo hace definitivo)' })
  contabilizar(@Param('id', ParseIntPipe) id: number) {
    return this.contabilidadService.contabilizar(id);
  }

  @Patch('asientos/:id/anular')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Anular asiento contable (solo ADMIN)' })
  anularAsiento(@Param('id', ParseIntPipe) id: number) {
    return this.contabilidadService.anularAsiento(id);
  }

  // ── Libro Diario ───────────────────────────────────────────────────────────

  @Get('libro-diario')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Libro Diario — asientos contabilizados ordenados por fecha' })
  getLibroDiario(@Query() filtro: FiltroContabilidadDto) {
    return this.contabilidadService.getLibroDiario(filtro);
  }

  // ── Libro Mayor ────────────────────────────────────────────────────────────

  @Get('libro-mayor/:cuentaId')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Libro Mayor de una cuenta — movimientos con saldo acumulado' })
  @ApiQuery({ name: 'fechaDesde', required: false })
  @ApiQuery({ name: 'fechaHasta', required: false })
  getLibroMayor(
    @Param('cuentaId', ParseIntPipe) cuentaId: number,
    @Query('fechaDesde') fechaDesde?: string,
    @Query('fechaHasta') fechaHasta?: string,
  ) {
    return this.contabilidadService.getLibroMayor(cuentaId, fechaDesde, fechaHasta);
  }

  // ── Estados Financieros ────────────────────────────────────────────────────

  @Get('balance-comprobacion')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Balance de Comprobación — saldos de todas las cuentas' })
  @ApiQuery({ name: 'fechaDesde', required: false })
  @ApiQuery({ name: 'fechaHasta', required: false })
  getBalanceComprobacion(
    @Query('fechaDesde') fechaDesde?: string,
    @Query('fechaHasta') fechaHasta?: string,
  ) {
    return this.contabilidadService.getBalanceComprobacion(fechaDesde, fechaHasta);
  }

  @Get('balance-general')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Balance General — Activos = Pasivos + Patrimonio' })
  @ApiQuery({ name: 'fechaHasta', required: false })
  getBalanceGeneral(@Query('fechaHasta') fechaHasta?: string) {
    return this.contabilidadService.getBalanceGeneral(fechaHasta);
  }

  @Get('estado-resultados')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Estado de Resultados — Ingresos, Costos, Gastos, Utilidad Neta' })
  @ApiQuery({ name: 'fechaDesde', required: false })
  @ApiQuery({ name: 'fechaHasta', required: false })
  getEstadoResultados(
    @Query('fechaDesde') fechaDesde?: string,
    @Query('fechaHasta') fechaHasta?: string,
  ) {
    return this.contabilidadService.getEstadoResultados(fechaDesde, fechaHasta);
  }
}
