import {
  Controller, Get, Post, Delete, Body, Param,
  Query, ParseIntPipe, HttpCode, HttpStatus, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import {
  IsInt, IsPositive, IsOptional, IsEnum, IsNumber, IsString, IsDateString,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PreciosService } from './precios.service';
import { TierPrecio } from './entities/precio-especial.entity';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { User } from '../users/users.entity';

class CreatePrecioDto {
  @IsInt() @IsPositive()       productoId: number;
  @IsOptional() @IsInt()       clienteId?: number;
  @IsOptional() @IsEnum(TierPrecio) tier?: TierPrecio;
  @IsOptional() @IsString()    nombre?: string;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) precioFijo?: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) descuentoPorcentaje?: number;
  @IsOptional() @IsDateString() vigenciaDesde?: string;
  @IsOptional() @IsDateString() vigenciaHasta?: string;
}

@ApiTags('Listas de Precios')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR)
@Controller('precios')
export class PreciosController {
  constructor(private svc: PreciosService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Crear precio especial (por cliente, tier o global)' })
  crear(@Body() dto: CreatePrecioDto, @GetUser() usuario: User) {
    return this.svc.crear({ ...dto, userId: usuario.id });
  }

  @Get()
  @ApiOperation({ summary: 'Listar precios especiales con filtros' })
  @ApiQuery({ name: 'clienteId',  required: false })
  @ApiQuery({ name: 'productoId', required: false })
  @ApiQuery({ name: 'tier',       required: false, enum: TierPrecio })
  listar(
    @Query('clienteId')  clienteId?:  number,
    @Query('productoId') productoId?: number,
    @Query('tier')       tier?:       TierPrecio,
  ) {
    return this.svc.listar({
      clienteId:  clienteId  ? Number(clienteId)  : undefined,
      productoId: productoId ? Number(productoId) : undefined,
      tier,
    });
  }

  @Get('calcular')
  @ApiOperation({ summary: 'Calcular precio final para un producto + cliente' })
  @ApiQuery({ name: 'productoId', required: true })
  @ApiQuery({ name: 'clienteId',  required: false })
  @ApiQuery({ name: 'cantidad',   required: false })
  calcular(
    @Query('productoId', ParseIntPipe) productoId: number,
    @Query('clienteId')  clienteId?: number,
    @Query('cantidad')   cantidad?: number,
  ) {
    return this.svc.calcularPrecio(
      productoId,
      clienteId  ? Number(clienteId)  : undefined,
      cantidad   ? Number(cantidad)   : 1,
    );
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Eliminar precio especial' })
  eliminar(@Param('id', ParseIntPipe) id: number) {
    return this.svc.eliminar(id);
  }
}
