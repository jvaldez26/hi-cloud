import { Controller, Get, Post, Delete, Body, Param, Query, ParseIntPipe, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../tenant/tenant.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../users/enums/user-role.enum';
import { ModuloAddonGuard } from '../../modulos-addon/guards/modulo-addon.guard';
import { TenantService } from '../../tenant/tenant.service';
import { SimulacionesService } from './simulaciones.service';
import { CrearSimulacionDto, ConvertirSimulacionDto } from '../dto/prestamista.dto';

@Controller('prestamista/simulaciones')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard, ModuloAddonGuard('prestamista'))
@Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR)
@ApiTags('Prestamista - Simulaciones')
@ApiBearerAuth()
export class SimulacionesController {
  constructor(private readonly svc: SimulacionesService, private readonly tenantSvc: TenantService) {}
  private get empresaId() { return this.tenantSvc.getEmpresaId(); }

  @Post()
  crear(@Body() body: CrearSimulacionDto) { return this.svc.crear(this.empresaId, body); }

  @Get()
  listar(@Query('deudorId') deudorId?: string) {
    return this.svc.listar(this.empresaId, deudorId ? Number(deudorId) : undefined);
  }

  @Get(':id')
  obtener(@Param('id', ParseIntPipe) id: number) { return this.svc.obtener(this.empresaId, id); }

  @Delete(':id')
  eliminar(@Param('id', ParseIntPipe) id: number) { return this.svc.eliminar(this.empresaId, id); }

  @Post(':id/convertir-solicitud')
  convertir(@Param('id', ParseIntPipe) id: number, @Body() body: ConvertirSimulacionDto) {
    return this.svc.convertirSolicitud(this.empresaId, id, body);
  }
}
