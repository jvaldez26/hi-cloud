import {
  Controller, Get, Post, Put, Patch, Delete,
  Body, Param, Query, Request, UseGuards, ParseIntPipe,
  DefaultValuePipe, ParseIntPipe as PIP,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import {
  IsString, IsOptional, IsInt, IsNumber, IsEnum, IsDateString,
  IsPositive, MinLength, Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { JwtAuthGuard }      from '../auth/guards/jwt-auth.guard';
import { TenantGuard }       from '../tenant/tenant.guard';
import { ModuloAddonGuard }  from '../modulos-addon/guards/modulo-addon.guard';
import { GetUser }           from '../auth/decorators/get-user.decorator';
import { User }              from '../users/users.entity';
import { TenantService }     from '../tenant/tenant.service';
import { TransporteService } from './transporte.service';

// ── DTOs ─────────────────────────────────────────────────────────────────────

class CreateChoferDto {
  @IsString() @MinLength(2) nombre!: string;
  @IsOptional() @IsString() cedula?: string;
  @IsOptional() @IsString() telefono?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() licencia?: string;
  @IsOptional() @IsString() tipoLicencia?: string;
  @IsOptional() @IsDateString() vencimientoLicencia?: string;
  @IsOptional() @IsEnum(['activo','inactivo','suspendido']) estado?: string;
  @IsOptional() @IsString() notas?: string;
}

class UpdateChoferDto {
  @IsOptional() @IsString() @MinLength(2) nombre?: string;
  @IsOptional() @IsString() cedula?: string;
  @IsOptional() @IsString() telefono?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() licencia?: string;
  @IsOptional() @IsString() tipoLicencia?: string;
  @IsOptional() @IsDateString() vencimientoLicencia?: string;
  @IsOptional() @IsEnum(['activo','inactivo','suspendido']) estado?: string;
  @IsOptional() @IsString() notas?: string;
}

class CreateVehiculoDto {
  @IsString() @MinLength(3) placa!: string;
  @IsString() @MinLength(2) marca!: string;
  @IsString() @MinLength(1) modelo!: string;
  @IsOptional() @IsInt() @Type(() => Number) anio?: number;
  @IsOptional() @IsEnum(['carro','camion','van','furgon','moto','bus','pickup']) tipo?: string;
  @IsOptional() @IsString() color?: string;
  @IsOptional() @IsString() capacidad?: string;
  @IsOptional() @IsEnum(['operativo','mantenimiento','fuera_servicio']) estado?: string;
  @IsOptional() @IsInt() @IsPositive() @Type(() => Number) choferId?: number;
  @IsOptional() @IsDateString() seguroVencimiento?: string;
  @IsOptional() @IsDateString() marbeteVencimiento?: string;
  @IsOptional() @IsDateString() inspeccionVencimiento?: string;
  @IsOptional() @IsString() notas?: string;
}

class UpdateVehiculoDto {
  @IsOptional() @IsString() placa?: string;
  @IsOptional() @IsString() marca?: string;
  @IsOptional() @IsString() modelo?: string;
  @IsOptional() @IsInt() @Type(() => Number) anio?: number;
  @IsOptional() @IsEnum(['carro','camion','van','furgon','moto','bus','pickup']) tipo?: string;
  @IsOptional() @IsString() color?: string;
  @IsOptional() @IsString() capacidad?: string;
  @IsOptional() @IsEnum(['operativo','mantenimiento','fuera_servicio']) estado?: string;
  @IsOptional() @IsInt() @IsPositive() @Type(() => Number) choferId?: number;
  @IsOptional() @IsDateString() seguroVencimiento?: string;
  @IsOptional() @IsDateString() marbeteVencimiento?: string;
  @IsOptional() @IsDateString() inspeccionVencimiento?: string;
  @IsOptional() @IsString() notas?: string;
}

class CreateViajeDto {
  @IsOptional() @IsDateString() fecha?: string;
  @IsString() @MinLength(2) origen!: string;
  @IsString() @MinLength(2) destino!: string;
  @IsOptional() @IsInt() @IsPositive() @Type(() => Number) clienteId?: number;
  @IsOptional() @IsInt() @IsPositive() @Type(() => Number) choferId?: number;
  @IsOptional() @IsInt() @IsPositive() @Type(() => Number) vehiculoId?: number;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Type(() => Number) tarifa!: number;
  @IsOptional() @IsEnum(['programado','en_curso','completado','cancelado']) estado?: string;
  @IsOptional() @IsString() notas?: string;
}

class CreateCombustibleDto {
  @IsOptional() @IsInt() @IsPositive() @Type(() => Number) vehiculoId?: number;
  @IsOptional() @IsInt() @IsPositive() @Type(() => Number) choferId?: number;
  @IsOptional() @IsDateString() fecha?: string;
  @IsOptional() @IsEnum(['gasolina','diesel','gas']) tipoCombustible?: string;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 3 }) @Min(0) @Type(() => Number) galones?: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 })  @Min(0) @Type(() => Number) precioGalon?: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 })  @Min(0) @Type(() => Number) total?: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 1 })  @Min(0) @Type(() => Number) odometro?: number;
  @IsOptional() @IsString() estacion?: string;
  @IsOptional() @IsString() notas?: string;
}

class CreateMantenimientoDto {
  @IsOptional() @IsInt() @IsPositive() @Type(() => Number) vehiculoId?: number;
  @IsOptional() @IsDateString() fecha?: string;
  @IsOptional() @IsEnum(['preventivo','correctivo','emergencia']) tipo?: string;
  @IsString() @MinLength(3) descripcion!: string;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Type(() => Number) costo?: number;
  @IsOptional() @IsString() proveedor?: string;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 1 }) @Min(0) @Type(() => Number) odometroActual?: number;
  @IsOptional() @IsDateString() proximaFecha?: string;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 1 }) @Min(0) @Type(() => Number) proximoKm?: number;
  @IsOptional() @IsEnum(['programado','en_proceso','completado','cancelado']) estado?: string;
  @IsOptional() @IsString() notas?: string;
}

class UpdateMantenimientoDto {
  @IsOptional() @IsInt() @IsPositive() @Type(() => Number) vehiculoId?: number;
  @IsOptional() @IsDateString() fecha?: string;
  @IsOptional() @IsEnum(['preventivo','correctivo','emergencia']) tipo?: string;
  @IsOptional() @IsString() @MinLength(3) descripcion?: string;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Type(() => Number) costo?: number;
  @IsOptional() @IsString() proveedor?: string;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 1 }) @Min(0) @Type(() => Number) odometroActual?: number;
  @IsOptional() @IsDateString() proximaFecha?: string;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 1 }) @Min(0) @Type(() => Number) proximoKm?: number;
  @IsOptional() @IsEnum(['programado','en_proceso','completado','cancelado']) estado?: string;
  @IsOptional() @IsString() notas?: string;
}

class UpdateViajeDto {
  @IsOptional() @IsDateString() fecha?: string;
  @IsOptional() @IsString() origen?: string;
  @IsOptional() @IsString() destino?: string;
  @IsOptional() @IsInt() @IsPositive() @Type(() => Number) clienteId?: number;
  @IsOptional() @IsInt() @IsPositive() @Type(() => Number) choferId?: number;
  @IsOptional() @IsInt() @IsPositive() @Type(() => Number) vehiculoId?: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Type(() => Number) tarifa?: number;
  @IsOptional() @IsEnum(['programado','en_curso','completado','cancelado']) estado?: string;
  @IsOptional() @IsString() notas?: string;
}

// ── CONTROLLER ───────────────────────────────────────────────────────────────

@Controller('transporte')
@ApiTags('Transporte')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard, ModuloAddonGuard('transporte'))
export class TransporteController {
  constructor(
    private readonly svc: TransporteService,
    private readonly tenantSvc: TenantService,
  ) {}

  // Dashboard
  @Get('dashboard')
  dashboard() {
    return this.svc.getDashboard(this.tenantSvc.getEmpresaId());
  }

  // ── Choferes ──────────────────────────────────────────────────────────────
  @Get('choferes')
  listChoferes() {
    return this.svc.findAllChoferes(this.tenantSvc.getEmpresaId());
  }

  @Post('choferes')
  createChofer(@Body() dto: CreateChoferDto) {
    return this.svc.createChofer(this.tenantSvc.getEmpresaId(), dto);
  }

  @Put('choferes/:id')
  updateChofer(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateChoferDto) {
    return this.svc.updateChofer(this.tenantSvc.getEmpresaId(), id, dto);
  }

  @Delete('choferes/:id')
  deleteChofer(@Param('id', ParseIntPipe) id: number) {
    return this.svc.deleteChofer(this.tenantSvc.getEmpresaId(), id);
  }

  // ── Vehículos ─────────────────────────────────────────────────────────────
  @Get('vehiculos')
  listVehiculos() {
    return this.svc.findAllVehiculos(this.tenantSvc.getEmpresaId());
  }

  @Post('vehiculos')
  createVehiculo(@Body() dto: CreateVehiculoDto) {
    return this.svc.createVehiculo(this.tenantSvc.getEmpresaId(), dto);
  }

  @Put('vehiculos/:id')
  updateVehiculo(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateVehiculoDto) {
    return this.svc.updateVehiculo(this.tenantSvc.getEmpresaId(), id, dto);
  }

  @Delete('vehiculos/:id')
  deleteVehiculo(@Param('id', ParseIntPipe) id: number) {
    return this.svc.deleteVehiculo(this.tenantSvc.getEmpresaId(), id);
  }

  // ── Viajes ────────────────────────────────────────────────────────────────
  @Get('viajes')
  listViajes(
    @Query('estado') estado?: string,
    @Query('page',  new DefaultValuePipe(1),  PIP) page  = 1,
    @Query('limit', new DefaultValuePipe(50), PIP) limit = 50,
  ) {
    return this.svc.findAllViajes(this.tenantSvc.getEmpresaId(), { estado, page, limit });
  }

  @Get('viajes/:id')
  getViaje(@Param('id', ParseIntPipe) id: number) {
    return this.svc.findOneViaje(this.tenantSvc.getEmpresaId(), id);
  }

  @Post('viajes')
  createViaje(@Body() dto: CreateViajeDto) {
    return this.svc.createViaje(
      this.tenantSvc.getEmpresaId(),
      this.tenantSvc.getSucursalId() ?? undefined,
      dto,
    );
  }

  @Put('viajes/:id')
  updateViaje(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateViajeDto) {
    return this.svc.updateViaje(this.tenantSvc.getEmpresaId(), id, dto);
  }

  @Post('viajes/:id/facturar')
  facturarViaje(
    @Param('id', ParseIntPipe) id: number,
    @GetUser() usuario: User,
  ) {
    return this.svc.facturarViaje(this.tenantSvc.getEmpresaId(), id, usuario);
  }

  // ── Combustible ───────────────────────────────────────────────────────────
  @Get('combustible')
  listCombustible(
    @Query('vehiculoId', new DefaultValuePipe(0), PIP) vehiculoId = 0,
    @Query('page',       new DefaultValuePipe(1),  PIP) page      = 1,
    @Query('limit',      new DefaultValuePipe(50), PIP) limit     = 50,
  ) {
    return this.svc.findAllCombustible(this.tenantSvc.getEmpresaId(), {
      vehiculoId: vehiculoId || undefined, page, limit,
    });
  }

  @Get('combustible/stats')
  combustibleStats() {
    return this.svc.getCombustibleStats(this.tenantSvc.getEmpresaId());
  }

  @Post('combustible')
  createCombustible(@Body() dto: CreateCombustibleDto) {
    return this.svc.createCombustible(this.tenantSvc.getEmpresaId(), dto);
  }

  @Delete('combustible/:id')
  deleteCombustible(@Param('id', ParseIntPipe) id: number) {
    return this.svc.deleteCombustible(this.tenantSvc.getEmpresaId(), id);
  }

  // ── Mantenimiento ─────────────────────────────────────────────────────────
  @Get('mantenimiento')
  listMantenimientos(
    @Query('vehiculoId', new DefaultValuePipe(0), PIP) vehiculoId = 0,
    @Query('estado') estado?: string,
    @Query('page',  new DefaultValuePipe(1),  PIP) page  = 1,
    @Query('limit', new DefaultValuePipe(50), PIP) limit = 50,
  ) {
    return this.svc.findAllMantenimientos(this.tenantSvc.getEmpresaId(), {
      vehiculoId: vehiculoId || undefined, estado, page, limit,
    });
  }

  @Get('mantenimiento/programado')
  mantenimientoProgramado() {
    return this.svc.getMantenimientoProgramado(this.tenantSvc.getEmpresaId());
  }

  @Post('mantenimiento')
  createMantenimiento(@Body() dto: CreateMantenimientoDto) {
    return this.svc.createMantenimiento(this.tenantSvc.getEmpresaId(), dto);
  }

  @Put('mantenimiento/:id')
  updateMantenimiento(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateMantenimientoDto) {
    return this.svc.updateMantenimiento(this.tenantSvc.getEmpresaId(), id, dto);
  }

  @Delete('mantenimiento/:id')
  deleteMantenimiento(@Param('id', ParseIntPipe) id: number) {
    return this.svc.deleteMantenimiento(this.tenantSvc.getEmpresaId(), id);
  }
}
