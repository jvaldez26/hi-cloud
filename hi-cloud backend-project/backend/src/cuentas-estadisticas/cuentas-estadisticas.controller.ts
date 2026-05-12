import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query,
  ParseIntPipe, HttpCode, HttpStatus, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import {
  IsString, IsOptional, IsEnum, IsNumber, IsInt,
  IsDateString, IsPositive,
} from 'class-validator';
import { CuentasEstadisticasService } from './cuentas-estadisticas.service';
import { TipoCuentaEstadistica } from './entities/cuenta-estadistica.entity';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { User } from '../users/users.entity';

class CreateCuentaDto {
  @IsString()                                  codigo!:      string;
  @IsString()                                  nombre!:      string;
  @IsOptional() @IsString()                    descripcion?: string;
  @IsOptional() @IsString()                    unidad?:      string;
  @IsOptional() @IsEnum(TipoCuentaEstadistica) tipo?:        TipoCuentaEstadistica;
  @IsOptional() @IsString()                    categoria?:   string;
}

class RegistrarMovDto {
  @IsInt() @IsPositive()       cuentaId!:     number;
  @IsDateString()              fecha!:        string;
  @IsNumber()                  valor!:        number;
  @IsOptional() @IsString()    descripcion?:  string;
  @IsOptional() @IsString()    referencia?:   string;
}

@ApiTags('Cuentas Estadísticas')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.CONTADOR)
@Controller('cuentas-estadisticas')
export class CuentasEstadisticasController {
  constructor(private svc: CuentasEstadisticasService) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Resumen del mes actual para todas las cuentas estadísticas' })
  getDashboard() { return this.svc.getDashboard(); }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Crear cuenta estadística' })
  crear(@Body() dto: CreateCuentaDto) { return this.svc.crear(dto); }

  @Get()
  @ApiOperation({ summary: 'Listar cuentas estadísticas' })
  @ApiQuery({ name: 'categoria', required: false })
  listar(@Query('categoria') categoria?: string) { return this.svc.listar(categoria); }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de cuenta estadística' })
  findOne(@Param('id', ParseIntPipe) id: number) { return this.svc.findById(id); }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar cuenta estadística' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: CreateCuentaDto) {
    return this.svc.update(id, dto as any);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar cuenta estadística' })
  delete(@Param('id', ParseIntPipe) id: number) { return this.svc.delete(id); }

  @Post('movimientos')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Registrar valor en una cuenta estadística' })
  registrar(@Body() dto: RegistrarMovDto, @GetUser() user: User) {
    return this.svc.registrar({ ...dto, userId: user.id });
  }

  @Get(':id/movimientos')
  @ApiOperation({ summary: 'Historial de movimientos de una cuenta' })
  @ApiQuery({ name: 'desde', required: false })
  @ApiQuery({ name: 'hasta', required: false })
  getMovimientos(
    @Param('id', ParseIntPipe) id: number,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
  ) { return this.svc.getMovimientos(id, desde, hasta); }

  @Delete('movimientos/:id')
  @ApiOperation({ summary: 'Eliminar registro de movimiento estadístico' })
  deleteMovimiento(@Param('id', ParseIntPipe) id: number) { return this.svc.deleteMovimiento(id); }

  @Get(':id/resumen-mensual')
  @ApiOperation({ summary: 'Resumen mensual de una cuenta para un año dado' })
  @ApiQuery({ name: 'anio', required: false, example: 2026 })
  getResumenMensual(
    @Param('id', ParseIntPipe) id: number,
    @Query('anio') anio?: string,
  ) { return this.svc.getResumenMensual(id, anio ? Number(anio) : new Date().getFullYear()); }
}
