import {
  Controller, Get, Post, Delete, Body, Param, Query,
  ParseIntPipe, HttpCode, HttpStatus, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import {
  IsString, IsOptional, IsEnum, IsNumber, IsInt, IsArray,
  IsPositive, Min, Max, ValidateNested, IsDateString,
} from 'class-validator';
import { Type } from 'class-transformer';
import { DistribucionCostosService } from './distribucion-costos.service';
import { PeriodicitadRegla } from './entities/regla-distribucion.entity';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { User } from '../users/users.entity';

class LineaReglaDto {
  @IsInt() @IsPositive()            cuentaDestinoId!:     number;
  @IsOptional() @IsString()         cuentaDestinoNombre?: string;
  @IsOptional() @IsInt()            centroCostoId?:       number;
  @IsOptional() @IsString()         centroCostoNombre?:   string;
  @IsNumber() @Min(0.01) @Max(100)  porcentaje!:          number;
  @IsOptional() @IsString()         descripcion?:         string;
}

class CreateReglaDto {
  @IsString()                           nombre!:              string;
  @IsOptional() @IsString()             descripcion?:         string;
  @IsInt() @IsPositive()                cuentaOrigenId!:      number;
  @IsOptional() @IsString()             cuentaOrigenNombre?:  string;
  @IsOptional() @IsEnum(PeriodicitadRegla) periodicidad?:     PeriodicitadRegla;
  @IsArray() @ValidateNested({ each: true }) @Type(() => LineaReglaDto)
  lineas!: LineaReglaDto[];
}

class EjecutarDto {
  @IsNumber() @Min(0.01)    monto!:      number;
  @IsDateString()           fecha!:      string;
  @IsOptional() @IsString() concepto?:   string;
}

@ApiTags('Distribución de Costos')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.CONTADOR)
@Controller('distribucion-costos')
export class DistribucionCostosController {
  constructor(private svc: DistribucionCostosService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Crear regla de distribución de costos (porcentajes deben sumar 100%)' })
  crear(@Body() dto: CreateReglaDto) { return this.svc.crearRegla(dto); }

  @Get()
  @ApiOperation({ summary: 'Listar reglas de distribución activas' })
  listar() { return this.svc.getReglas(); }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de una regla' })
  findOne(@Param('id', ParseIntPipe) id: number) { return this.svc.findReglaById(id); }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar regla de distribución' })
  delete(@Param('id', ParseIntPipe) id: number) { return this.svc.deleteRegla(id); }

  @Post(':id/simular')
  @ApiOperation({ summary: 'Simular distribución para un monto dado (sin crear asiento)' })
  simular(@Param('id', ParseIntPipe) id: number, @Query('monto') monto: string) {
    return this.svc.simularRegla(id, Number(monto));
  }

  @Post(':id/ejecutar')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Ejecutar regla — crea asiento contable de distribución automáticamente' })
  ejecutar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: EjecutarDto,
    @GetUser() user: User,
  ) {
    return this.svc.ejecutarRegla(id, dto.monto, dto.fecha, user.id, dto.concepto);
  }
}
