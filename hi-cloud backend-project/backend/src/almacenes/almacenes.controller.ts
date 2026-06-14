import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query,
  ParseIntPipe, HttpCode, HttpStatus, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import {
  IsString, IsOptional, IsNumber, IsInt, IsPositive, IsDateString, Min, MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { AlmacenesService } from './almacenes.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { User } from '../users/users.entity';

class CreateAlmacenDto {
  @IsString()                                              nombre!:       string;
  @IsOptional() @IsString() @MaxLength(20)                 codigo?:       string;
  @IsOptional() @IsString()                                direccion?:    string;
  @IsOptional() @IsString()                                ciudad?:       string;
  @IsOptional() @IsString()                                responsable?:  string;
  @IsOptional() @IsString()                                telefono?:     string;
  @IsOptional() @IsString()                                descripcion?:  string;
  @IsOptional() @IsInt() @IsPositive() @Type(() => Number) sucursalId?:   number;
}

class CreateTransferenciaDto {
  @IsInt() @IsPositive()                 almacenOrigenId!:  number;
  @IsInt() @IsPositive()                 almacenDestinoId!: number;
  @IsInt() @IsPositive()                 productoId!:       number;
  @IsNumber() @Min(0.001)               cantidad!:          number;
  @IsOptional() @IsDateString()          fecha?:            string;
  @IsOptional() @IsString()              notas?:            string;
}

@ApiTags('Almacenes Múltiples')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR)
@Controller('almacenes')
export class AlmacenesController {
  constructor(private svc: AlmacenesService) {}

  @Get('resumen')
  @ApiOperation({ summary: 'Resumen de stock por almacén' })
  getResumen() { return this.svc.getResumen(); }

  // Almacenes CRUD
  @Post()
  @HttpCode(HttpStatus.CREATED)
  crear(@Body() dto: CreateAlmacenDto) { return this.svc.crear(dto); }

  @Get()
  listar(@Query('sucursalId') sucursalId?: string) {
    return this.svc.listar(sucursalId ? Number(sucursalId) : undefined);
  }

  @Get(':id/stock')
  @ApiOperation({ summary: 'Stock de todos los productos en este almacén' })
  getStock(@Param('id', ParseIntPipe) id: number) { return this.svc.getStockAlmacen(id); }

  @Patch(':id')
  actualizar(@Param('id', ParseIntPipe) id: number, @Body() dto: CreateAlmacenDto) {
    return this.svc.actualizar(id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  eliminar(@Param('id', ParseIntPipe) id: number) { return this.svc.eliminar(id); }

  // Stock por producto (todos los almacenes)
  @Get('producto/:productoId/stock')
  @ApiOperation({ summary: 'Stock de un producto en todos los almacenes' })
  getStockProducto(@Param('productoId', ParseIntPipe) productoId: number) {
    return this.svc.getStockProducto(productoId);
  }

  // Transferencias
  @Post('transferencias')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Crear transferencia entre almacenes' })
  crearTransferencia(@Body() dto: CreateTransferenciaDto, @GetUser() user: User) {
    return this.svc.crearTransferencia(dto, user.id);
  }

  @Get('transferencias')
  @ApiOperation({ summary: 'Listar transferencias' })
  listarTransferencias(
    @Query('page')      page?:      string,
    @Query('almacenId') almacenId?: string,
  ) {
    return this.svc.listarTransferencias(
      page      ? Number(page)      : 1,
      15,
      almacenId ? Number(almacenId) : undefined,
    );
  }

  @Patch('transferencias/:id/confirmar')
  @ApiOperation({ summary: 'Confirmar: PENDIENTE → EN_TRANSITO (descuenta stock origen)' })
  confirmar(@Param('id', ParseIntPipe) id: number, @GetUser() user: User) {
    return this.svc.confirmarTransferencia(id, user.id);
  }

  @Patch('transferencias/:id/recibir')
  @ApiOperation({ summary: 'Recibir: EN_TRANSITO → COMPLETADA (suma stock destino)' })
  recibir(@Param('id', ParseIntPipe) id: number, @GetUser() user: User) {
    return this.svc.recibirTransferencia(id, user.id);
  }

  @Patch('transferencias/:id/cancelar')
  @ApiOperation({ summary: 'Cancelar transferencia (revierte stock si estaba EN_TRANSITO)' })
  cancelar(@Param('id', ParseIntPipe) id: number, @GetUser() user: User) {
    return this.svc.cancelarTransferencia(id, user.id);
  }
}
