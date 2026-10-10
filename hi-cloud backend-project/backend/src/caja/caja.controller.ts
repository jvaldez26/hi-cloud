import {
  Controller, Get, Post, Patch, Body, Param,
  ParseIntPipe, Query, HttpCode, HttpStatus, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { IsOptional, IsNumber, IsString, IsNotEmpty, IsInt, IsPositive,
         Min, MaxLength, Max, IsEnum, IsDateString, IsBoolean, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { CajaService } from './caja.service';
import { CategoriaRetiro } from './entities/retiro-caja.entity';
import { RequiereSupervisor } from '../supervisor-politicas/guards/requiere-supervisor.guard';
import { RequiereSupervisorSiempre } from '../supervisor-politicas/guards/requiere-supervisor-siempre.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { User } from '../users/users.entity';
import { TenantService } from '../tenant/tenant.service';

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

/**
 * Una línea de lo que la cajera declara por forma de pago al cerrar — ver
 * cuadre-por-forma-pago.util.ts. `confirmado` es la salida de emergencia
 * para una forma que SÍ tuvo ventas pero genuinamente no se cobró nada por
 * ahí (error del datáfono, venta corregida después, etc.): sin marcarlo, el
 * servicio rechaza el cierre en vez de asumir el 0 en silencio (requisito
 * que cierra el bug real de Caja Diaria: un formulario que no declaraba por
 * forma dejaba tarjeta/transferencia en 0 sin que nadie lo confirmara).
 */
class DeclaracionFormaPagoDto {
  @IsString() @IsNotEmpty()
  forma: string;

  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0)
  monto: number;

  @IsOptional() @IsBoolean()
  confirmado?: boolean;
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

  /**
   * Obligatorio SOLO cuando un ADMIN/CONTADOR cierra la caja de OTRO cajero
   * (lo exige el servicio, no aquí — acá no se sabe todavía de quién es la
   * caja). Si la caja es suya, se ignora aunque venga.
   */
  @IsOptional() @IsString() @MaxLength(300)
  motivo?: string;

  /**
   * Lo que la cajera declara por forma de pago — ver DeclaracionFormaPagoDto.
   * El servicio exige una línea por cada forma con ventas en el turno
   * (o `confirmado: true` si genuinamente fue 0); sin esto, un formulario
   * viejo o externo podía cerrar solo con efectivo y dejar tarjeta/
   * transferencia en 0 sin que nadie se enterara.
   */
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => DeclaracionFormaPagoDto)
  declaradoPorForma?: DeclaracionFormaPagoDto[];
}

class AnularCierreDto {
  @IsString() @MaxLength(300)
  motivo: string;
}

class AprobarDescuadreDto {
  @IsString() @IsNotEmpty() @MaxLength(500)
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

class RechazarRetiroDto {
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
  constructor(private cajaService: CajaService, private tenantService: TenantService) {}

  @Get('hoy')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR)
  @ApiOperation({ summary: 'Cajas del día — ADMIN/CONTADOR pueden filtrar por ?vendedorId; VENDEDOR ve su propia caja' })
  getCajaHoy(@Query('vendedorId') vendedorId?: string, @GetUser() usuario?: User) {
    // Rol de la empresa ACTIVA (TenantService/usuario_empresa), nunca
    // `usuario.role` (columna global de `users`, solo sincronizada con la
    // empresa PRINCIPAL — ver el mismo comentario en
    // requiere-supervisor.guard.ts). Antes de este fix, un VENDEDOR cuyo
    // rol global fuera otro caía en la rama de abajo (getCajaHoy sin
    // vendedorId) en vez de getCajaHoyByUserId — veía el panel de
    // ADMIN/CONTADOR en vez del suyo propio.
    if (this.tenantService.getRolEmpresa() === UserRole.VENDEDOR) {
      // A-1: VENDEDOR solo ve su propia caja (scoped by userId, no acepta param cliente)
      return this.cajaService.getCajaHoyByUserId(usuario!.id);
    }
    const vid = vendedorId !== undefined ? Number(vendedorId) : undefined;
    return this.cajaService.getCajaHoy(vid);
  }

  @Get('abiertas')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'TODAS las cajas abiertas de la empresa, sin importar la fecha — incluye las huérfanas de días anteriores' })
  getCajasAbiertas() {
    return this.cajaService.getCajasAbiertas();
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
  @UseGuards(RequiereSupervisor('cerrar_caja'))
  @ApiOperation({ summary: 'Cerrar caja por ID — calcula diferencia vs efectivo físico; un VENDEDOR solo puede cerrar la suya; ADMIN/CONTADOR necesitan motivo para cerrar la de otro' })
  cerrarCaja(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CerrarCajaDto,
    @GetUser() usuario: User,
  ) {
    return this.cajaService.cerrarCaja(
      id, dto.saldoFisico, dto.notas,
      dto.desgloseBilletes, dto.desglosePago,
      { id: usuario.id, nombre: usuario.nombre },
      dto.motivo,
      dto.declaradoPorForma,
    );
  }

  // Anular un cierre (reabrirlo para recerrarlo) exige la autorización de
  // OTRA persona — RequiereSupervisorSiempre, sin bypass por rol: ni el
  // propio ADMIN que anula puede autorizarse a sí mismo. La clave ya estaba
  // en el catálogo (anular_cierre_caja) pero nunca se conectó a este guard.
  @Patch(':id/anular')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @UseGuards(RequiereSupervisorSiempre('anular_cierre_caja'))
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Anular cierre de caja — regresa a estado abierta para seguir facturando; requiere autorización de otra persona' })
  anularCierre(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AnularCierreDto,
    @GetUser() usuario: User,
  ) {
    // El nombre sale del usuario autenticado, nunca del body.
    return this.cajaService.anularCierre(id, dto.motivo, usuario.id, usuario.nombre);
  }

  @Patch(':id/aprobar-descuadre')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Aprobar un cierre fuera del umbral de descuadre — ADMIN/CONTADOR, motivo obligatorio, queda en auditoría' })
  aprobarDescuadre(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AprobarDescuadreDto,
    @GetUser() usuario: User,
  ) {
    return this.cajaService.aprobarDescuadre(id, dto.motivo, usuario.id, usuario.nombre);
  }

  @Get('historial')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR)
  @ApiOperation({ summary: 'Historial de cierres (filtrable por ?vendedorId, ?mes, ?anio) — VENDEDOR nunca ve el monto de una caja ABIERTA' })
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
  @UseGuards(RequiereSupervisor('registrar_retiro'))
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

  @Patch('retiros/:id/rechazar')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Rechazar retiro pendiente — el supervisor no lo avala; el monto NO revierte; funciona con caja cerrada' })
  rechazarRetiro(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RechazarRetiroDto,
    @GetUser() usuario: User,
  ) {
    const nombre = (usuario as any).nombre ?? (usuario as any).name ?? `Usuario #${usuario.id}`;
    return this.cajaService.rechazarRetiro(id, dto.motivo, usuario.id, nombre);
  }

  @Get('retiros')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR)
  @ApiOperation({ summary: 'Listar retiros de una caja. ?cajaId para una caja específica.' })
  listarRetiros(@Query('cajaId') cajaId?: string) {
    return this.cajaService.listarRetiros(cajaId ? Number(cajaId) : undefined);
  }

  @Get(':id/facturas-detalle')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR)
  @ApiOperation({ summary: 'Detalle de facturas del turno para impresión de cierre — VENDEDOR solo su propia caja' })
  getFacturasDetalle(@Param('id', ParseIntPipe) id: number, @GetUser() usuario: User) {
    return this.cajaService.getFacturasDetalle(id, usuario);
  }

  @Get(':id/imprimir')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR)
  @UseGuards(RequiereSupervisor('imprimir_cierre_caja_abierta'))
  @ApiOperation({ summary: 'Datos completos (nunca recortados por rol) para imprimir el cierre, con detalle de facturas — el frontend solo la llama para cajas ABIERTA; un VENDEDOR necesita autorización de supervisor' })
  getDatosParaImprimir(@Param('id', ParseIntPipe) id: number, @GetUser() usuario: User) {
    return this.cajaService.getDatosParaImprimir(id, { id: usuario.id });
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR)
  @ApiOperation({ summary: 'Una caja por id — enlace directo del aviso de caja abierta de un día anterior. VENDEDOR nunca ve el monto de una caja ABIERTA' })
  obtenerUna(@Param('id', ParseIntPipe) id: number) {
    return this.cajaService.obtenerUnaPorId(id);
  }

  @Get(':id/ajustes')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Correcciones de forma de pago registradas sobre facturas de un cierre YA CERRADO — el cierre original no se altera' })
  listarAjustes(@Param('id', ParseIntPipe) id: number) {
    return this.cajaService.listarAjustes(id);
  }
}
