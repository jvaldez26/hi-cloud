import {
  Controller, Get, Post, Patch, Body, Param, Query,
  ParseIntPipe, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../tenant/tenant.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../users/enums/user-role.enum';
import { ModuloAddonGuard } from '../../modulos-addon/guards/modulo-addon.guard';
import { VehiculosService } from './vehiculos.service';
import { CrearVehiculoDto, ActualizarVehiculoDto } from '../dto/prestamista.dto';

@Controller('prestamista/vehiculos')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard, ModuloAddonGuard('prestamista'))
@ApiTags('Prestamista - Vehículos')
@ApiBearerAuth()
export class VehiculosController {
  constructor(private readonly svc: VehiculosService) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR, UserRole.VIEWER)
  findAll(@Query() params: any) { return this.svc.findAll(params); }

  @Get('alertas-seguro')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR, UserRole.VIEWER)
  alertasSeguro() { return this.svc.alertasSeguro(); }

  @Get('buscar-placa/:placa')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR, UserRole.VIEWER)
  findByPlaca(@Param('placa') placa: string) { return this.svc.findByPlaca(placa); }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR, UserRole.VIEWER)
  findOne(@Param('id', ParseIntPipe) id: number) { return this.svc.findOne(id); }

  @Post()
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR)
  create(@Body() body: CrearVehiculoDto) { return this.svc.create(body); }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR)
  update(@Param('id', ParseIntPipe) id: number, @Body() body: ActualizarVehiculoDto) { return this.svc.update(id, body); }
}
