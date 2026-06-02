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
import { TesoreriaService } from './tesoreria.service';
import { CreateCuentaBancariaDto } from './dto/create-cuenta-bancaria.dto';
import {
  RegistrarDepositoDto,
  RegistrarRetiroDto,
  RegistrarTransferenciaDto,
} from './dto/registrar-movimiento.dto';
import { CreateConciliacionDto } from './dto/create-conciliacion.dto';
import { FiltroMovimientoDto, FiltroConciliacionDto } from './dto/filtro-tesoreria.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { User } from '../users/users.entity';

@ApiTags('Tesorería y Flujo de Caja')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('tesoreria')
export class TesoreriaController {
  constructor(private tesoreriaService: TesoreriaService) {}

  // ── Dashboard widget ───────────────────────────────────────────────────────

  @Get('dashboard')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR, UserRole.VIEWER)
  @ApiOperation({ summary: 'Widget de tesorería para el Dashboard: cuentas, balance y actividad reciente' })
  getDashboard() {
    return this.tesoreriaService.getDashboard();
  }

  // ── Resumen ────────────────────────────────────────────────────────────────

  @Get('resumen')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Resumen de tesorería: saldos por moneda y movimientos del día' })
  getResumen() {
    return this.tesoreriaService.getResumenTesoreria();
  }

  // ── Cuentas Bancarias ──────────────────────────────────────────────────────

  @Post('cuentas')
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Registrar nueva cuenta bancaria' })
  createCuenta(@Body() dto: CreateCuentaBancariaDto, @GetUser() usuario: User) {
    return this.tesoreriaService.createCuenta(dto, usuario.id);
  }

  @Get('cuentas')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Listar todas las cuentas bancarias con saldo actual' })
  getCuentas() {
    return this.tesoreriaService.getCuentas();
  }

  @Get('cuentas/:id')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Detalle de cuenta bancaria' })
  findCuenta(@Param('id', ParseIntPipe) id: number) {
    return this.tesoreriaService.findCuentaById(id);
  }

  @Patch('cuentas/:id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Actualizar datos de cuenta bancaria' })
  updateCuenta(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: Partial<CreateCuentaBancariaDto>,
  ) {
    return this.tesoreriaService.updateCuenta(id, dto);
  }

  @Delete('cuentas/:id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Eliminar cuenta bancaria (solo si saldo = 0)' })
  removeCuenta(@Param('id', ParseIntPipe) id: number) {
    return this.tesoreriaService.removeCuenta(id);
  }

  // ── Movimientos ────────────────────────────────────────────────────────────

  @Post('movimientos/deposito')
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Registrar depósito manual en cuenta bancaria' })
  registrarDeposito(@Body() dto: RegistrarDepositoDto, @GetUser() usuario: User) {
    return this.tesoreriaService.registrarDeposito(dto, usuario.id);
  }

  @Post('movimientos/retiro')
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Registrar retiro manual de cuenta bancaria' })
  registrarRetiro(@Body() dto: RegistrarRetiroDto, @GetUser() usuario: User) {
    return this.tesoreriaService.registrarRetiro(dto, usuario.id);
  }

  @Post('movimientos/transferencia')
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Transferir entre cuentas bancarias propias' })
  registrarTransferencia(@Body() dto: RegistrarTransferenciaDto, @GetUser() usuario: User) {
    return this.tesoreriaService.registrarTransferencia(dto, usuario.id);
  }

  @Get('movimientos')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Listar movimientos con filtros (cuenta, tipo, origen, fechas)' })
  getMovimientos(@Query() filtro: FiltroMovimientoDto) {
    return this.tesoreriaService.getMovimientos(filtro);
  }

  // ── Conciliación Bancaria ──────────────────────────────────────────────────

  @Post('conciliaciones')
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Iniciar conciliación bancaria para un período' })
  iniciarConciliacion(@Body() dto: CreateConciliacionDto, @GetUser() usuario: User) {
    return this.tesoreriaService.iniciarConciliacion(dto, usuario.id);
  }

  @Get('conciliaciones')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Listar conciliaciones' })
  getConciliaciones(@Query() filtro: FiltroConciliacionDto) {
    return this.tesoreriaService.getConciliaciones(filtro);
  }

  @Get('conciliaciones/:id')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Detalle de conciliación con diferencia calculada' })
  findConciliacion(@Param('id', ParseIntPipe) id: number) {
    return this.tesoreriaService.findConciliacionById(id);
  }

  @Patch('conciliaciones/:id/movimiento/:movimientoId')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Marcar movimiento como conciliado en este período' })
  conciliarMovimiento(
    @Param('id', ParseIntPipe) id: number,
    @Param('movimientoId', ParseIntPipe) movimientoId: number,
  ) {
    return this.tesoreriaService.conciliarMovimiento(id, movimientoId);
  }

  @Patch('conciliaciones/:id/cerrar')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Cerrar conciliación (solo si diferencia = 0)' })
  cerrarConciliacion(@Param('id', ParseIntPipe) id: number) {
    return this.tesoreriaService.cerrarConciliacion(id);
  }

  // ── Reportes ───────────────────────────────────────────────────────────────

  @Get('flujo-caja')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Flujo de Caja del período: entradas vs salidas por origen' })
  @ApiQuery({ name: 'fechaDesde', required: true,  example: '2026-01-01' })
  @ApiQuery({ name: 'fechaHasta', required: true,  example: '2026-12-31' })
  getFlujoCaja(
    @Query('fechaDesde') fechaDesde: string,
    @Query('fechaHasta') fechaHasta: string,
  ) {
    return this.tesoreriaService.getFlujoCaja(fechaDesde, fechaHasta);
  }

  @Get('flujo-por-dia')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Flujo diario del mes (entradas vs salidas por día, para gráfica)' })
  @ApiQuery({ name: 'mes',  required: true, example: 5 })
  @ApiQuery({ name: 'anio', required: true, example: 2026 })
  getFlujoPorDia(
    @Query('mes')  mes:  number,
    @Query('anio') anio: number,
  ) {
    return this.tesoreriaService.getFlujoPorDia(Number(mes), Number(anio));
  }
}
