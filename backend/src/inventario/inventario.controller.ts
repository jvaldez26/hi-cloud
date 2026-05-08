import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { InventarioService } from './inventario.service';
import { RegistrarEntradaDto } from './dto/registrar-entrada.dto';
import { RegistrarSalidaDto } from './dto/registrar-salida.dto';
import { RegistrarAjusteDto } from './dto/registrar-ajuste.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { IsOptional, IsString } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

class MovimientosFilterDto extends PaginationDto {
  @IsOptional() @IsString() tipo?: string;
  @IsOptional() @IsString() desde?: string;
  @IsOptional() @IsString() hasta?: string;
}
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { User } from '../users/users.entity';

@ApiTags('Inventario')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('inventario')
export class InventarioController {
  constructor(private inventarioService: InventarioService) {}

  @Post('entrada')
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Registrar entrada de mercancía al inventario' })
  registrarEntrada(
    @Body() dto: RegistrarEntradaDto,
    @GetUser() usuario: User,
  ) {
    return this.inventarioService.registrarEntradaDesdeDto(dto, usuario.id);
  }

  @Post('salida')
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR)
  @ApiOperation({ summary: 'Registrar salida de mercancía del inventario' })
  registrarSalida(
    @Body() dto: RegistrarSalidaDto,
    @GetUser() usuario: User,
  ) {
    return this.inventarioService.registrarSalidaDesdeDto(dto, usuario.id);
  }

  @Post('ajuste')
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Ajuste manual de inventario (solo ADMIN) — establece cantidad exacta' })
  registrarAjuste(
    @Body() dto: RegistrarAjusteDto,
    @GetUser() usuario: User,
  ) {
    return this.inventarioService.registrarAjusteDesdeDto(dto, usuario.id);
  }

  @Get('movimientos')
  @ApiOperation({ summary: 'Historial de movimientos con filtros: search, tipo, desde, hasta' })
  getMovimientos(@Query() pagination: MovimientosFilterDto) {
    return this.inventarioService.getMovimientos(pagination);
  }

  @Get('movimientos/:productoId')
  @ApiOperation({ summary: 'Movimientos de un producto específico' })
  getMovimientosPorProducto(
    @Param('productoId', ParseIntPipe) productoId: number,
    @Query() pagination: PaginationDto,
  ) {
    return this.inventarioService.getMovimientosPorProducto(productoId, pagination);
  }

  @Get('stock-bajo')
  @ApiOperation({ summary: 'Productos con stock igual o menor al stock mínimo' })
  getStockBajo() {
    return this.inventarioService.getStockBajo();
  }
}
