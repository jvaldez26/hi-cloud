import {
  Controller, Get, Post, Patch, Delete, Body, Param,
  ParseIntPipe, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiHeader } from '@nestjs/swagger';
import {
  IsString, IsOptional, IsInt, IsPositive, IsNumber, Min,
  IsDateString,
} from 'class-validator';
import { Type } from 'class-transformer';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { User } from '../users/users.entity';
import { CajaChicaService } from './caja-chica.service';

class CreateCajaDto {
  @IsString()                                            nombre!: string;
  @IsNumber() @Min(1) @Type(() => Number)                montoInicial!: number;
  @IsOptional() @IsNumber() @Min(0) @Type(() => Number)  montoMaximoEgreso?: number;
  @IsOptional() @IsNumber() @Min(0) @Type(() => Number)  pctAlerta?: number;
  @IsOptional() @IsInt() @IsPositive() @Type(() => Number) responsableId?: number;
  @IsOptional() @IsString()                              nombreResponsable?: string;
  @IsOptional() @IsString()                              descripcion?: string;
}

class EgresoDto {
  @IsDateString()                    fecha!: string;
  @IsString()                        descripcion!: string;
  @IsOptional() @IsString()          categoria?: string;
  @IsNumber() @Min(0.01) @Type(() => Number) monto!: number;
  @IsOptional() @IsString()          comprobante?: string;
  @IsOptional() @IsString()          beneficiario?: string;
  @IsOptional() @IsString()          notas?: string;
}

class ReposicionDto {
  @IsDateString()                    fecha!: string;
  @IsOptional() @IsString()          descripcion?: string;
  @IsNumber() @Min(0.01) @Type(() => Number) monto!: number;
  @IsOptional() @IsString()          notas?: string;
}

@ApiTags('Caja Chica')
@ApiBearerAuth('access-token')
@ApiHeader({ name: 'X-Empresa-ID', description: 'ID de la empresa activa', required: true })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.CONTADOR)
@Controller('caja-chica')
export class CajaChicaController {
  constructor(private readonly svc: CajaChicaService) {}

  @Get('resumen')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VIEWER)
  @ApiOperation({ summary: 'Resumen de todas las cajas chicas con alertas' })
  resumen() { return this.svc.resumen(); }

  @Get('cajas')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VIEWER)
  @ApiOperation({ summary: 'Listar todas las cajas chicas' })
  listarCajas() { return this.svc.listarCajas(); }

  @Get('cajas/:id')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VIEWER)
  @ApiOperation({ summary: 'Detalle de una caja chica' })
  findOne(@Param('id', ParseIntPipe) id: number) { return this.svc.findOne(id); }

  @Post('cajas')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Crear nueva caja chica con apertura inicial' })
  crearCaja(@Body() dto: CreateCajaDto, @GetUser() user: User) {
    return this.svc.crearCaja(dto, user.id);
  }

  @Patch('cajas/:id/cerrar')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Cerrar caja chica' })
  cerrar(@Param('id', ParseIntPipe) id: number, @GetUser() user: User) {
    return this.svc.cerrar(id, user.id);
  }

  // ─── Movimientos ─────────────────────────────────────────────────────────────

  @Get('cajas/:id/movimientos')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VIEWER)
  @ApiOperation({ summary: 'Historial de movimientos de una caja chica' })
  listarMovimientos(@Param('id', ParseIntPipe) id: number) {
    return this.svc.listarMovimientos(id);
  }

  @Post('cajas/:id/egreso')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Registrar egreso/gasto de la caja chica' })
  egreso(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: EgresoDto,
    @GetUser() user: User,
  ) {
    return this.svc.registrarEgreso(id, dto, user.id);
  }

  @Post('cajas/:id/reponer')
  @ApiOperation({ summary: 'Reponer fondos a la caja chica' })
  reponer(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReposicionDto,
    @GetUser() user: User,
  ) {
    return this.svc.reponer(id, dto, user.id);
  }
}
