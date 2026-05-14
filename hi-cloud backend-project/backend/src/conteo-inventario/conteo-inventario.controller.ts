import {
  Controller, Get, Post, Patch, Body, Param,
  ParseIntPipe, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiHeader } from '@nestjs/swagger';
import {
  IsString, IsOptional, IsInt, IsPositive, IsNumber, Min, IsDateString,
} from 'class-validator';
import { Type } from 'class-transformer';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { User } from '../users/users.entity';
import { ConteoInventarioService } from './conteo-inventario.service';

class CreateConteoDto {
  @IsString()                                              nombre!: string;
  @IsDateString()                                          fecha!: string;
  @IsOptional() @IsInt() @IsPositive() @Type(() => Number) sucursalId?: number;
  @IsOptional() @IsString()                                categoria?: string;
  @IsOptional() @IsString()                                notas?: string;
}

class ActualizarLineaDto {
  @IsInt() @IsPositive() @Type(() => Number)               lineaId!: number;
  @IsNumber() @Min(0) @Type(() => Number)                  cantidadFisica!: number;
  @IsOptional() @IsString()                                observaciones?: string;
}

@ApiTags('Conteo Físico de Inventario')
@ApiBearerAuth('access-token')
@ApiHeader({ name: 'X-Empresa-ID', required: true })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.CONTADOR)
@Controller('conteo-inventario')
export class ConteoInventarioController {
  constructor(private readonly svc: ConteoInventarioService) {}

  @Get('resumen')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VIEWER)
  resumen() { return this.svc.resumen(); }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VIEWER)
  @ApiOperation({ summary: 'Listar conteos de inventario' })
  listar() { return this.svc.listar(); }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VIEWER)
  @ApiOperation({ summary: 'Detalle del conteo con todas sus líneas' })
  findOne(@Param('id', ParseIntPipe) id: number) { return this.svc.findOne(id); }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Crear hoja de conteo (carga automáticamente los productos con su stock actual)' })
  crear(@Body() dto: CreateConteoDto, @GetUser() user: User) {
    return this.svc.crear(dto, user.id);
  }

  @Patch(':id/iniciar')
  @ApiOperation({ summary: 'Iniciar el proceso de conteo físico' })
  iniciar(@Param('id', ParseIntPipe) id: number) { return this.svc.iniciar(id); }

  @Patch(':id/linea')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Registrar cantidad física contada de un producto' })
  actualizarLinea(@Param('id', ParseIntPipe) id: number, @Body() dto: ActualizarLineaDto) {
    return this.svc.actualizarLinea(id, dto);
  }

  @Patch(':id/confirmar')
  @ApiOperation({ summary: 'Confirmar conteo y aplicar ajustes de stock' })
  confirmar(@Param('id', ParseIntPipe) id: number) { return this.svc.confirmar(id); }

  @Patch(':id/cancelar')
  @ApiOperation({ summary: 'Cancelar conteo sin aplicar cambios' })
  cancelar(@Param('id', ParseIntPipe) id: number) { return this.svc.cancelar(id); }
}
