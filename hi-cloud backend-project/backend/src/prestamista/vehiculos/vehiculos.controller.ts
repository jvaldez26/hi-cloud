import {
  Controller, Get, Post, Patch, Body, Param, Query,
  ParseIntPipe, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../tenant/tenant.guard';
import { ModuloAddonGuard } from '../../modulos-addon/guards/modulo-addon.guard';
import { VehiculosService } from './vehiculos.service';

@Controller('prestamista/vehiculos')
@UseGuards(JwtAuthGuard, TenantGuard, ModuloAddonGuard('prestamista'))
@ApiTags('Prestamista - Vehículos')
@ApiBearerAuth()
export class VehiculosController {
  constructor(private readonly svc: VehiculosService) {}

  @Get()
  findAll(@Query() params: any) {
    return this.svc.findAll(params);
  }

  @Get('alertas-seguro')
  alertasSeguro() {
    return this.svc.alertasSeguro();
  }

  @Get('buscar-placa/:placa')
  findByPlaca(@Param('placa') placa: string) {
    return this.svc.findByPlaca(placa);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.svc.findOne(id);
  }

  @Post()
  create(@Body() body: any) {
    return this.svc.create(body);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: any) {
    return this.svc.update(id, body);
  }
}
