import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query,
  ParseIntPipe, HttpCode, HttpStatus, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import {
  IsString, IsOptional, IsEnum, IsNumber, IsInt, IsPositive,
  IsDateString, Min,
} from 'class-validator';
import { ChequesService } from './cheques.service';
import { EstadoChequera } from './entities/chequera.entity';
import { EstadoCheque, TipoCheque } from './entities/cheque.entity';
import { PaginationDto } from '../common/dto/pagination.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/enums/user-role.enum';

class CreateChequeraDto {
  @IsString()              banco!:        string;
  @IsString()              numeroCuenta!: string;
  @IsOptional() @IsString()nombreCuenta?: string;
  @IsInt() @Min(1)         serieDesde!:   number;
  @IsInt() @Min(1)         serieHasta!:   number;
  @IsOptional() @IsString()descripcion?:  string;
}

class CreateChequeDto {
  @IsInt() @IsPositive()            chequeraId!:   number;
  @IsOptional() @IsString()         numero?:       string;
  @IsOptional() @IsEnum(TipoCheque) tipo?:         TipoCheque;
  @IsDateString()                   fecha!:        string;
  @IsString()                       beneficiario!: string;
  @IsNumber() @Min(0)               monto!:        number;
  @IsOptional() @IsString()         concepto?:     string;
  @IsOptional() @IsInt()            facturaId?:    number;
  @IsOptional() @IsInt()            compraId?:     number;
  @IsOptional() @IsString()         referencia?:   string;
}

class CambiarEstadoDto {
  @IsEnum(EstadoCheque)             estado!:      EstadoCheque;
  @IsOptional() @IsDateString()     fechaCobro?:  string;
}

@ApiTags('Cheques y Chequeras')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.CONTADOR)
@Controller('cheques')
export class ChequesController {
  constructor(private svc: ChequesService) {}

  @Get('dashboard')
  getDashboard() { return this.svc.getDashboard(); }

  @Get('resumen')
  getResumen(@Query('mes') mes: string, @Query('anio') anio: string) {
    return this.svc.getResumenPeriodo(Number(mes), Number(anio));
  }

  // Chequeras
  @Post('chequeras')
  @HttpCode(HttpStatus.CREATED)
  crearChequera(@Body() dto: CreateChequeraDto) { return this.svc.crearChequera(dto); }

  @Get('chequeras')
  listarChequeras() { return this.svc.listarChequeras(); }

  // Cheques
  @Post()
  @HttpCode(HttpStatus.CREATED)
  emitirCheque(@Body() dto: CreateChequeDto) { return this.svc.emitirCheque(dto); }

  @Get()
  listar(
    @Query() pagination: PaginationDto,
    @Query('estado')     estado?:     EstadoCheque,
    @Query('tipo')       tipo?:       TipoCheque,
    @Query('chequeraId') chequeraId?: string,
  ) { return this.svc.listarCheques(pagination, estado, tipo, chequeraId ? Number(chequeraId) : undefined); }

  @Patch(':id/estado')
  cambiarEstado(@Param('id', ParseIntPipe) id: number, @Body() dto: CambiarEstadoDto) {
    return this.svc.cambiarEstado(id, dto.estado, dto.fechaCobro);
  }

  @Delete(':id')
  eliminar(@Param('id', ParseIntPipe) id: number) { return this.svc.eliminar(id); }
}
