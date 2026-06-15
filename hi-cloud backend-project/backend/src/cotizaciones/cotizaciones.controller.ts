import {
  Controller, Get, Post, Patch, Delete, Body,
  Param, Query, ParseIntPipe, HttpCode, HttpStatus, UseGuards, Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { CotizacionesService } from './cotizaciones.service';
import { CreateCotizacionDto } from './dto/create-cotizacion.dto';
import { CotizacionEstado } from './entities/cotizacion.entity';
import { PaginationDto } from '../common/dto/pagination.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { User } from '../users/users.entity';

class CambiarEstadoDto {
  @IsEnum(CotizacionEstado)
  estado: CotizacionEstado;
}

@ApiTags('Cotizaciones')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('cotizaciones')
export class CotizacionesController {
  constructor(private cotizacionesService: CotizacionesService) {}

  @Get('resumen')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR)
  @ApiOperation({ summary: 'Resumen de cotizaciones por estado' })
  getResumen() {
    return this.cotizacionesService.getResumen();
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR)
  @ApiOperation({ summary: 'Crear nueva cotización con detalles' })
  create(@Body() dto: CreateCotizacionDto, @GetUser() usuario: User) {
    return this.cotizacionesService.create(dto, usuario);
  }

  @Get()
  @ApiOperation({ summary: 'Listar cotizaciones con paginación' })
  findAll(@Query() pagination: PaginationDto) {
    return this.cotizacionesService.findAll(pagination);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle completo de una cotización' })
  findById(@Param('id', ParseIntPipe) id: number) {
    return this.cotizacionesService.findById(id);
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR)
  @ApiOperation({ summary: 'Editar cotización en BORRADOR (cliente, detalles, notas, fecha)' })
  actualizar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: Partial<CreateCotizacionDto>,
    @GetUser() usuario: User,
  ) {
    return this.cotizacionesService.actualizar(id, dto, usuario);
  }

  @Patch(':id/estado')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR)
  @ApiOperation({ summary: 'Cambiar estado (borrador→enviada→aceptada/rechazada)' })
  cambiarEstado(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CambiarEstadoDto,
  ) {
    return this.cotizacionesService.cambiarEstado(id, dto.estado);
  }

  @Post(':id/convertir')
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR)
  @ApiOperation({ summary: '🔄 Convertir cotización ACEPTADA a Factura (borrador)' })
  convertirAFactura(
    @Param('id', ParseIntPipe) id: number,
    @GetUser() usuario: User,
  ) {
    return this.cotizacionesService.convertirAFactura(id, usuario);
  }

  @Get(':id/pdf')
  @ApiOperation({ summary: 'Generar PDF de cotización' })
  async getPDF(
    @Param('id', ParseIntPipe) id: number,
    @Res() res: Response,
  ) {
    const { buffer, filename } = await this.cotizacionesService.generarPDF(id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }

  @Get(':id/recibo-pdf')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR, UserRole.VIEWER)
  @ApiOperation({ summary: 'Recibo térmico 80mm de cotización (POS)' })
  async reciboPdf(
    @Param('id', ParseIntPipe) id: number,
    @Res() res: Response,
  ) {
    const { buffer, filename } = await this.cotizacionesService.generarReciboTermico(id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.length);
    res.end(buffer);
  }

  @Post(':id/duplicar')
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR)
  @ApiOperation({ summary: 'Duplicar cotización — crea nueva en borrador con mismos ítems' })
  duplicar(@Param('id', ParseIntPipe) id: number, @GetUser() usuario: User) {
    return this.cotizacionesService.duplicar(id, usuario.id);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Eliminar cotización en borrador' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.cotizacionesService.remove(id);
  }
}
