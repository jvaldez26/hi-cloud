import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query,
  ParseIntPipe, HttpCode, HttpStatus, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import {
  IsString, IsOptional, IsEnum, IsNumber, IsInt, IsDateString, Min,
} from 'class-validator';
import { FlotaService } from './flota.service';
import { EstadoVehiculo } from './entities/vehiculo.entity';
import { TipoRegistroFlota } from './entities/registro-flota.entity';
import { PaginationDto } from '../common/dto/pagination.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { User } from '../users/users.entity';

class CreateVehiculoDto {
  @IsString()                           placa!:   string;
  @IsString()                           marca!:   string;
  @IsString()                           modelo!:  string;
  @IsInt() @Min(1900)                   anio!:    number;
  @IsOptional() @IsString()             color?:   string;
  @IsOptional() @IsString()             tipoVehiculo?: string;
  @IsOptional() @IsInt() @Min(0)        kilometraje?:  number;
  @IsOptional() @IsString()             conductor?:    string;
  @IsOptional() @IsDateString()         vencimientoItbis?:      string;
  @IsOptional() @IsDateString()         vencimientoSeguro?:     string;
  @IsOptional() @IsDateString()         vencimientoInspeccion?: string;
  @IsOptional() @IsNumber()             valorCompra?: number;
}

class CreateRegistroDto {
  @IsInt() @IsPositive()                vehiculoId!: number;
  @IsEnum(TipoRegistroFlota)            tipo!:       TipoRegistroFlota;
  @IsDateString()                       fecha!:      string;
  @IsNumber() @Min(0)                   monto!:      number;
  @IsOptional() @IsInt()                kilometraje?: number;
  @IsOptional() @IsNumber()             litros?:      number;
  @IsOptional() @IsString()             descripcion?: string;
  @IsOptional() @IsString()             proveedor?:   string;
}

function IsPositive() { return Min(1); }

@ApiTags('Flota de Vehículos')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.CONTADOR)
@Controller('flota')
export class FlotaController {
  constructor(private svc: FlotaService) {}

  @Get('dashboard')
  getDashboard() { return this.svc.getDashboard(); }

  @Post('vehiculos')
  @HttpCode(HttpStatus.CREATED)
  crearVehiculo(@Body() dto: CreateVehiculoDto) { return this.svc.crearVehiculo(dto); }

  @Get('vehiculos')
  listar() { return this.svc.listarVehiculos(); }

  @Get('vehiculos/:id')
  getVehiculo(@Param('id', ParseIntPipe) id: number) { return this.svc.getVehiculo(id); }

  @Get('vehiculos/:id/resumen')
  getResumen(@Param('id', ParseIntPipe) id: number) { return this.svc.getResumenVehiculo(id); }

  @Patch('vehiculos/:id')
  actualizar(@Param('id', ParseIntPipe) id: number, @Body() dto: CreateVehiculoDto) {
    return this.svc.actualizarVehiculo(id, dto);
  }

  @Delete('vehiculos/:id')
  @Roles(UserRole.ADMIN)
  eliminar(@Param('id', ParseIntPipe) id: number) { return this.svc.eliminarVehiculo(id); }

  @Post('registros')
  @HttpCode(HttpStatus.CREATED)
  registrar(@Body() dto: CreateRegistroDto, @GetUser() user: User) {
    return this.svc.registrar(dto, user.id);
  }

  @Get('vehiculos/:id/registros')
  listarRegistros(@Param('id', ParseIntPipe) id: number, @Query() pagination: PaginationDto) {
    return this.svc.listarRegistros(id, pagination);
  }

  @Delete('registros/:id')
  eliminarRegistro(@Param('id', ParseIntPipe) id: number) { return this.svc.eliminarRegistro(id); }
}
