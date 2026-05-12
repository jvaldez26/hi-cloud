import {
  Controller, Get, Post, Delete, Body, Param, Query,
  ParseIntPipe, HttpCode, HttpStatus, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import {
  IsEnum, IsString, IsNotEmpty, IsNumber, IsPositive,
  IsOptional, IsDateString, Min,
} from 'class-validator';
import { GastosService } from './gastos.service';
import { CategoriaGasto } from './entities/gasto.entity';
import { PaginationDto } from '../common/dto/pagination.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { User } from '../users/users.entity';

class CreateGastoDto {
  @IsDateString()                                  fecha: string;
  @IsEnum(CategoriaGasto)                          categoria: CategoriaGasto;
  @IsString() @IsNotEmpty()                        descripcion: string;
  @IsNumber({ maxDecimalPlaces: 2 }) @IsPositive() monto: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) itbis?: number;
  @IsOptional() @IsString()                        proveedor?: string;
  @IsOptional() @IsString()                        comprobante?: string;
  @IsOptional() @IsString()                        rncProveedor?: string;
}

@ApiTags('Gastos Operativos')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.CONTADOR)
@Controller('gastos')
export class GastosController {
  constructor(private svc: GastosService) {}

  @Get('categorias')
  @ApiOperation({ summary: 'Listar categorías de gastos con cuenta contable' })
  getCategorias() {
    return this.svc.getCategorias();
  }

  @Get('resumen')
  @ApiOperation({ summary: 'Resumen de gastos por categoría en un mes' })
  getResumen(
    @Query('mes')  mes:  number,
    @Query('anio') anio: number,
  ) {
    return this.svc.getResumenMes(Number(mes), Number(anio));
  }

  @Get('anual')
  @ApiOperation({ summary: 'Gastos mensuales del año (para gráfica)' })
  getAnual(@Query('anio') anio: number) {
    return this.svc.getResumenAnual(Number(anio));
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Registrar gasto (genera asiento contable automático)' })
  crear(@Body() dto: CreateGastoDto, @GetUser() usuario: User) {
    return this.svc.crear({ ...dto, userId: usuario.id });
  }

  @Get()
  @ApiOperation({ summary: 'Listar gastos con filtros por mes, año y categoría' })
  listar(
    @Query() pagination: PaginationDto,
    @Query('mes')       mes?:       number,
    @Query('anio')      anio?:      number,
    @Query('categoria') categoria?: CategoriaGasto,
  ) {
    return this.svc.listar(pagination, mes ? Number(mes) : undefined, anio ? Number(anio) : undefined, categoria);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de un gasto' })
  findById(@Param('id', ParseIntPipe) id: number) {
    return this.svc.findById(id);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Eliminar gasto (solo ADMIN)' })
  eliminar(@Param('id', ParseIntPipe) id: number) {
    return this.svc.eliminar(id);
  }
}
