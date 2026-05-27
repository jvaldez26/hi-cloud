import {
  Controller, Get, Post, Patch, Delete, Body,
  Param, Query, ParseIntPipe, HttpCode, HttpStatus, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { FacturasRecurrentesService } from './facturas-recurrentes.service';
import { Frecuencia } from './entities/factura-recurrente.entity';
import { PaginationDto } from '../common/dto/pagination.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { User } from '../users/users.entity';
import {
  IsString, IsInt, IsPositive, IsEnum, IsArray,
  IsOptional, IsDateString, IsNumber,
} from 'class-validator';
import { Type } from 'class-transformer';

class DetalleDto {
  @IsOptional() @IsInt() productoId?: number;
  @IsString() descripcion: string;
  @IsInt() @IsPositive() @Type(() => Number) cantidad: number;
  @IsNumber({ maxDecimalPlaces: 2 }) @IsPositive() precioUnitario: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) porcentajeIva?: number;
}

class CreateRecurrenteDto {
  @IsString() nombre: string;
  @IsInt() @IsPositive() clienteId: number;
  @IsArray() detalles: DetalleDto[];
  @IsEnum(Frecuencia) frecuencia: Frecuencia;
  @IsInt() @IsPositive() diaEjecucion: number;
  @IsDateString() fechaInicio: string;
  @IsOptional() @IsDateString() fechaFin?: string;
  @IsOptional() @IsString() notas?: string;
}

@ApiTags('Facturas Recurrentes')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.CONTADOR)
@Controller('facturas-recurrentes')
export class FacturasRecurrentesController {
  constructor(private svc: FacturasRecurrentesService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Crear factura recurrente (auto-facturación)' })
  crear(@Body() dto: CreateRecurrenteDto, @GetUser() usuario: User) {
    return this.svc.crear(dto as any, usuario);
  }

  @Get()
  @ApiOperation({ summary: 'Listar facturas recurrentes activas' })
  listar(@Query() pagination: PaginationDto) {
    return this.svc.listar(pagination);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de una factura recurrente' })
  findById(@Param('id', ParseIntPipe) id: number) {
    return this.svc.findById(id);
  }

  @Get(':id/historial')
  @ApiOperation({ summary: 'Historial de facturas generadas por esta plantilla' })
  historial(@Param('id', ParseIntPipe) id: number, @Query() pagination: PaginationDto) {
    return this.svc.historialRecurrente(id, pagination);
  }

  @Patch(':id/toggle')
  @ApiOperation({ summary: 'Activar o pausar la factura recurrente' })
  toggle(@Param('id', ParseIntPipe) id: number) {
    return this.svc.toggleActiva(id);
  }

  @Post(':id/ejecutar-ahora')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Generar la factura ahora (sin esperar al cron)' })
  ejecutarAhora(@Param('id', ParseIntPipe) id: number) {
    return this.svc.ejecutarAhora(id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar factura recurrente' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.svc.remove(id);
  }
}
