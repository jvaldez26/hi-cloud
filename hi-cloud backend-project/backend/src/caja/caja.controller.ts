import {
  Controller, Get, Post, Patch, Body, Param,
  ParseIntPipe, Query, HttpCode, HttpStatus, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { IsOptional, IsNumber, IsString, IsNotEmpty, IsInt, IsPositive,
         Min, MaxLength, Max, IsEnum, IsDateString } from 'class-validator';
import { CajaService } from './caja.service';
import { CategoriaRetiro } from './entities/retiro-caja.entity';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { User } from '../users/users.entity';

class AbrirCajaDto {
  @IsNotEmpty() @IsInt() @IsPositive()
  vendedorId: number;

  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0)
  saldoApertura?: number;

  @IsOptional() @IsString()
  vendedorNombre?: string;

  @IsOptional() @IsString()
  notas?: string;
}

class CerrarCajaDto {
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0)
  saldoFisico: number;

  @IsOptional() @IsString()
  notas?: string;

  @IsOptional()
  desgloseBilletes?: Record<string, number>;

  @IsOptional()
  desglosePago?: Record<string, string>;
}

class AnularCierreDto {
  @IsString() @MaxLength(300)
  motivo: string;
}

class RegistrarRetiroDto {
  /** ID de la caja diaria a la que se imputa el retiro. Obligatorio para
   *  evitar que el retiro se aplique a la caja equivocada en empresas con
   *  varios cajeros abiertos al mismo tiempo. */
  @IsInt() @IsPositive()
  cajaId: number;

  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) @Max(9_999_999)
  monto: number;

  @IsString() @IsNotEmpty() @MaxLength(300)
  descripcion: string;

  @IsOptional() @IsEnum(CategoriaRetiro)
  categoria?: CategoriaRetiro;

  /** Cuenta bancaria destino (solo cuando categoria = deposito_banco) */
  @IsOptional() @IsInt() @IsPositive()
  cuentaBancariaId?: number;
}

class AutorizarRetiroDto {
  // El autorizador se toma del JWT — no acepta parámetros externos.
}

class AnularRetiroDto {
  @IsString() @IsNotEmpty() @MaxLength(500)
  motivo: string;
}

class ReporteRetirosDto {
  @IsDateString()
  desde: string;

  @IsDateString()
  hasta: string;

  @IsOptional() @IsInt()
  vendedorId?: number;

  @IsOptional() @IsEnum(CategoriaRetiro)
  categoria?: CategoriaRetiro;

  @IsOptional() @IsString()
  estado?: string;
}

@ApiTags('Caja')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('caja')
export class CajaController {
  constructor(private cajaService: CajaService) {}

  @Get('hoy')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR)
  @ApiOperation({ summary: 'Cajas del día — ADMIN/CONTADOR pueden filtrar por ?vendedorId; VENDEDOR ve su propia caja' })
  getCajaHoy(@Query('vendedorId') vendedorId?: string, @GetUser() usuario?: User) {
    const role = (usuario as any)?.role;
    if (role === UserRole.VENDEDOR) {
      // A-1: VENDEDOR solo ve su propia caja (scoped by userId, no acepta param cliente)
      return this.cajaService.getCajaHoyByUserId(usuario!.id);
    }
    const vid = vendedorId !== undefined ? Number(vendedorId) : undefined;
    return this.cajaService.getCajaHoy(vid);
  }

  @Get('usuarios')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Usuarios operativos de la empresa (para vincular a perfil vendedor)' })
  getUsuarios() {
    return this.cajaService.listarUsuarios();
  }

  @Get('cajeros')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR)
  @ApiOperation({ summary: 'Vendedores activos de la empresa (para selector de cajero en caja)' })
  getCajeros() {
    return this.cajaService.listarCajeros();
  }

  @Post('abrir')
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR)
  @ApiOperation({ summary: 'Abrir caja del día para el cajero seleccionado' })
  abrirCaja(@Body() dto: AbrirCajaDto, @GetUser() usuario: User) {
    return this.cajaService.abrirCaja(
      usuario.id,
      dto.saldoApertura ?? 0,
      dto.notas,
      dto.vendedorId,
      dto.vendedorNombre,  // opcional — el servicio lo resuelve desde BD si no viene
    );
  }

  @Patch(':id/cerrar')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR)
  @ApiOperation({ summary: 'Cerrar caja por ID — calcula diferencia vs efectivo físico' })
  cerrarCaja(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CerrarCajaDto,
  ) {
    return this.cajaService.cerrarCaja(
      id, dto.saldoFisico, dto.notas,
      dto.desgloseBilletes, dto.desglosePago,
    );
  }

  @Patch(':id/anular')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Anular cierre de caja — regresa a estado abierta para seguir facturando' })
  anularCierre(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AnularCierreDto,
    @GetUser() usuario: User,
  ) {
    return this.cajaService.anularCierre(id, dto.motivo, usuario.id);
  }

  @Get('historial')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR)
  @ApiOperation({ summary: 'Historial de cierres (filtrable por ?vendedorId, ?mes, ?anio)' })
  getHistorial(
    @Query('page')       page?:       string,
    @Query('limit')      limit?:      string,
    @Query('vendedorId') vendedorId?: string,
    @Query('mes')        mes?:        string,
    @Query('anio')       anio?:       string,
  ) {
    const vid = vendedorId !== undefined ? Number(vendedorId) : undefined;
    const m   = mes  ? Number(mes)  : undefined;
    const a   = anio ? Number(anio) : undefined;
    return this.cajaService.getHistorial(
      Number(page ?? 1), Number(limit ?? 20), vid, m, a,
    );
  }

  @Get('resumen')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR)
  @ApiOperation({ summary: 'Resumen mensual de caja' })
  getResumen(
    @Query('mes')  mes:  number,
    @Query('anio') anio: number,
  ) {
    return this.cajaService.getResumenMes(Number(mes), Number(anio));
  }

  @Post('retiros')
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR)
  @ApiOperation({ summary: 'Registrar retiro de caja — cajaId obligatorio para imputar al cajero correcto' })
  registrarRetiro(@Body() dto: RegistrarRetiroDto, @GetUser() usuario: User) {
    return this.cajaService.registrarRetiro(
      dto.cajaId,
      dto.monto,
      dto.descripcion,
      usuario.id,
      (usuario as any).nombre ?? (usuario as any).name,
      dto.categoria,
      dto.cuentaBancariaId,
    );
  }

  @Get('retiros/reporte')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Reporte completo de retiros por período — sin paginar, para exportar' })
  reporteRetiros(
    @Query('desde')      desde:      string,
    @Query('hasta')      hasta:      string,
    @Query('vendedorId') vendedorId?: string,
    @Query('categoria')  categoria?:  string,
    @Query('estado')     estado?:     string,
  ) {
    return this.cajaService.reporteRetiros({
      desde, hasta,
      vendedorId: vendedorId ? Number(vendedorId) : undefined,
      categoria,
      estado,
    });
  }

  @Patch('retiros/:id/autorizar')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Autorizar un retiro pendiente — solo ADMIN/CONTADOR' })
  autorizarRetiro(@Param('id', ParseIntPipe) id: number, @GetUser() usuario: User) {
    const nombre = (usuario as any).nombre ?? (usuario as any).name ?? `Usuario #${usuario.id}`;
    return this.cajaService.autorizarRetiro(id, usuario.id, nombre);
  }

  @Patch('retiros/:id/anular')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Anular un retiro con traza — no borra, solo marca como anulado' })
  anularRetiro(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AnularRetiroDto,
    @GetUser() usuario: User,
  ) {
    const nombre = (usuario as any).nombre ?? (usuario as any).name ?? `Usuario #${usuario.id}`;
    return this.cajaService.anularRetiro(id, dto.motivo, usuario.id, nombre);
  }

  @Get('retiros')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR)
  @ApiOperation({ summary: 'Listar retiros de una caja. ?cajaId para una caja específica.' })
  listarRetiros(@Query('cajaId') cajaId?: string) {
    return this.cajaService.listarRetiros(cajaId ? Number(cajaId) : undefined);
  }

  @Get(':id/facturas-detalle')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Detalle de facturas del turno para impresión de cierre' })
  getFacturasDetalle(@Param('id', ParseIntPipe) id: number) {
    return this.cajaService.getFacturasDetalle(id);
  }
}
