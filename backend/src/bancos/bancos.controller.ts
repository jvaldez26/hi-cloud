import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query,
  ParseIntPipe, HttpCode, HttpStatus, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import {
  IsString, IsOptional, IsEnum, IsNumber, IsInt,
  IsPositive, IsDateString, IsBoolean, Min,
} from 'class-validator';
import { BancosService } from './bancos.service';
import { TipoCuenta } from './entities/cuenta-bancaria.entity';
import { TipoMovimientoBanco } from './entities/movimiento-bancario.entity';
import { PaginationDto } from '../common/dto/pagination.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/enums/user-role.enum';

class CreateCuentaDto {
  @IsString()                           nombre!:       string;
  @IsString()                           banco!:        string;
  @IsString()                           numeroCuenta!: string;
  @IsOptional() @IsEnum(TipoCuenta)     tipo?:         TipoCuenta;
  @IsOptional() @IsString()             moneda?:       string;
  @IsOptional() @IsNumber()             saldoInicial?: number;
  @IsOptional() @IsString()             descripcion?:  string;
}

class CreateMovimientoDto {
  @IsInt() @IsPositive()                cuentaId!:         number;
  @IsDateString()                       fecha!:            string;
  @IsString()                           descripcion!:      string;
  @IsOptional() @IsString()             referencia?:       string;
  @IsEnum(TipoMovimientoBanco)          tipo!:             TipoMovimientoBanco;
  @IsNumber() @Min(0)                   monto!:            number;
  @IsOptional() @IsNumber()             saldoResultante?:  number;
}

class ConciliarDto {
  @IsOptional() @IsInt() @IsPositive()  sistemaId?:   number;
  @IsOptional() @IsString()             sistemaTipo?: string;
}

class ImportCSVDto {
  @IsString() csvContent!: string;
  @IsOptional() @IsString() banco?: string;  // banreservas|bhd|popular|scotiabank|apap|generico
}

@ApiTags('Cuentas Bancarias y Conciliación')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.CONTADOR)
@Controller('bancos')
export class BancosController {
  constructor(private svc: BancosService) {}

  // Cuentas
  @Post('cuentas')
  @HttpCode(HttpStatus.CREATED)
  crearCuenta(@Body() dto: CreateCuentaDto) { return this.svc.crearCuenta(dto); }

  @Get('cuentas')
  listarCuentas() { return this.svc.listarCuentas(); }

  @Get('cuentas/:id')
  getCuenta(@Param('id', ParseIntPipe) id: number) { return this.svc.getCuenta(id); }

  @Patch('cuentas/:id')
  actualizarCuenta(@Param('id', ParseIntPipe) id: number, @Body() dto: CreateCuentaDto) {
    return this.svc.actualizarCuenta(id, dto);
  }

  @Delete('cuentas/:id')
  @Roles(UserRole.ADMIN)
  eliminarCuenta(@Param('id', ParseIntPipe) id: number) { return this.svc.eliminarCuenta(id); }

  // Movimientos
  @Post('movimientos')
  @HttpCode(HttpStatus.CREATED)
  agregarMovimiento(@Body() dto: CreateMovimientoDto) { return this.svc.agregarMovimiento(dto); }

  @Get('cuentas/:id/movimientos')
  listarMovimientos(
    @Param('id', ParseIntPipe) id: number,
    @Query() pagination: PaginationDto,
    @Query('soloNoConciliados') soloNoConciliados?: string,
  ) { return this.svc.listarMovimientos(id, pagination, soloNoConciliados === 'true'); }

  @Patch('movimientos/:id/conciliar')
  conciliar(@Param('id', ParseIntPipe) id: number, @Body() dto: ConciliarDto) {
    return this.svc.conciliarMovimiento(id, dto.sistemaId, dto.sistemaTipo);
  }

  @Patch('movimientos/:id/desconciliar')
  desconciliar(@Param('id', ParseIntPipe) id: number) { return this.svc.desconciliar(id); }

  @Delete('movimientos/:id')
  eliminarMovimiento(@Param('id', ParseIntPipe) id: number) { return this.svc.eliminarMovimiento(id); }

  // Conciliación
  @Get('cuentas/:id/resumen')
  @ApiOperation({ summary: 'Resumen de conciliación del período' })
  getResumen(
    @Param('id', ParseIntPipe) id: number,
    @Query('mes') mes: string,
    @Query('anio') anio: string,
  ) { return this.svc.getResumenConciliacion(id, Number(mes), Number(anio)); }

  @Post('cuentas/:id/importar-csv')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Importar estado de cuenta bancario en CSV' })
  importarCSV(@Param('id', ParseIntPipe) id: number, @Body() dto: ImportCSVDto) {
    return this.svc.importarCSV(id, dto.csvContent, dto.banco);
  }
}
