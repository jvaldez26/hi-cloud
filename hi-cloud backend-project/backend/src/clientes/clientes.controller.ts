import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
  UseGuards,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ClientesService } from './clientes.service';
import { CreateClienteDto } from './dto/create-cliente.dto';
import { UpdateClienteDto } from './dto/update-cliente.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/enums/user-role.enum';

@ApiTags('Clientes')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('clientes')
export class ClientesController {
  constructor(private clientesService: ClientesService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR)
  @ApiOperation({ summary: 'Crear cliente' })
  create(@Body() dto: CreateClienteDto) {
    return this.clientesService.create(dto);
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR, UserRole.VIEWER)
  @ApiOperation({ summary: 'Listar clientes con paginación' })
  findAll(@Query() pagination: PaginationDto) {
    return this.clientesService.findAll(pagination);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR, UserRole.VIEWER)
  @ApiOperation({ summary: 'Obtener cliente por ID' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.clientesService.findOne(id);
  }

  @Get(':id/estado-cuenta')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR)
  @ApiOperation({ summary: 'Estado de cuenta: facturas, cobros y saldo del cliente' })
  getEstadoCuenta(
    @Param('id', ParseIntPipe) id: number,
    @Query('fechaDesde') fechaDesde?: string,
    @Query('fechaHasta') fechaHasta?: string,
  ) {
    return this.clientesService.getEstadoCuenta(id, fechaDesde, fechaHasta);
  }

  @Get(':id/estado-cuenta/pdf')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR)
  @ApiOperation({ summary: 'Descargar Estado de Cuenta del cliente en PDF' })
  async getEstadoCuentaPdf(
    @Param('id', ParseIntPipe) id: number,
    @Query('fechaDesde') fechaDesde: string,
    @Query('fechaHasta') fechaHasta: string,
    @Res() res: Response,
  ) {
    const data    = await this.clientesService.getEstadoCuenta(id, fechaDesde, fechaHasta);
    const { buffer, filename } = await this.clientesService.generarEstadoCuentaPdf(data);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${filename}"` });
    res.send(buffer);
  }

  @Get('rnc/:rnc')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR, UserRole.VIEWER)
  @ApiOperation({
    summary: 'Clientes que comparten un RNC/Cédula',
    description:
      'Devuelve TODOS los clientes activos con ese RNC (con dirección y contacto ' +
      'para distinguirlos). Compartir RNC es válido: varias escuelas de un mismo ' +
      'distrito educativo facturan bajo el RNC del distrito y son clientes ' +
      'distintos. Se usa para la alerta no bloqueante al crear un cliente.',
  })
  buscarPorRnc(
    @Param('rnc') rnc: string,
    @Query('excluirId') excluirId?: string,
  ) {
    return this.clientesService.buscarPorRnc(
      rnc,
      excluirId ? Number(excluirId) : undefined,
    );
  }

  @Get('rfc/:rfc')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR, UserRole.VIEWER)
  @ApiOperation({
    summary: 'Buscar UN cliente por RNC/Cédula (compatibilidad)',
    description:
      'Devuelve el cliente más antiguo con ese RNC. Si varios lo comparten, ' +
      'incluye "otrosConMismoRnc". Para elegir entre varios usar GET /clientes/rnc/:rnc.',
  })
  findByRfc(@Param('rfc') rfc: string) {
    return this.clientesService.findByRfc(rfc);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR)
  @ApiOperation({ summary: 'Actualizar cliente' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateClienteDto) {
    return this.clientesService.update(id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Eliminar cliente (soft delete)' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.clientesService.remove(id);
  }
}
