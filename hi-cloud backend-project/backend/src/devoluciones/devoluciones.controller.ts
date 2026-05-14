import {
  Controller, Get, Post, Patch, Body, Param, Query,
  ParseIntPipe, HttpCode, HttpStatus, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { DevolucionesService } from './devoluciones.service';
import { CreateDevolucionDto } from './dto/create-devolucion.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { User } from '../users/users.entity';

@ApiTags('Devoluciones')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('devoluciones')
export class DevolucionesController {
  constructor(private devService: DevolucionesService) {}

  @Get('resumen')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Resumen de devoluciones por estado' })
  getResumen() {
    return this.devService.getResumen();
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Registrar devolución total o parcial de una factura' })
  create(@Body() dto: CreateDevolucionDto, @GetUser() usuario: User) {
    return this.devService.create(dto, usuario);
  }

  @Get()
  @ApiOperation({ summary: 'Listar devoluciones con paginación' })
  findAll(@Query() pagination: PaginationDto) {
    return this.devService.findAll(pagination);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle completo de una devolución' })
  findById(@Param('id', ParseIntPipe) id: number) {
    return this.devService.findById(id);
  }

  @Post(':id/procesar')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Procesar devolución: revierte inventario + asiento contable' })
  procesar(@Param('id', ParseIntPipe) id: number, @GetUser() usuario: User) {
    return this.devService.procesar(id, usuario);
  }

  @Patch(':id/anular')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Anular devolución pendiente (solo ADMIN)' })
  anular(@Param('id', ParseIntPipe) id: number) {
    return this.devService.anular(id);
  }
}
