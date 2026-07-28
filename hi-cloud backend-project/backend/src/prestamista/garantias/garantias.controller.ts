import { Controller, Get, Post, Patch, Body, Param, ParseIntPipe, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../tenant/tenant.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../users/enums/user-role.enum';
import { ModuloAddonGuard } from '../../modulos-addon/guards/modulo-addon.guard';
import { TenantService } from '../../tenant/tenant.service';
import { GarantiasService } from './garantias.service';
import { CrearGarantiaDto, ActualizarGarantiaDto } from '../dto/prestamista.dto';

@Controller('prestamista/garantias')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard, ModuloAddonGuard('prestamista'))
@ApiTags('Prestamista - Garantías')
@ApiBearerAuth()
export class GarantiasController {
  constructor(private readonly svc: GarantiasService, private readonly tenantSvc: TenantService) {}
  private get empresaId() { return this.tenantSvc.getEmpresaId(); }

  @Get('prestamo/:prestamoId')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR, UserRole.VIEWER)
  findByPrestamo(@Param('prestamoId', ParseIntPipe) id: number) {
    return this.svc.findByPrestamo(this.empresaId, id);
  }
  @Get('deudor/:deudorId')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR, UserRole.VIEWER)
  findByDeudor(@Param('deudorId', ParseIntPipe) id: number) {
    return this.svc.findByDeudor(this.empresaId, id);
  }
  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR, UserRole.VIEWER)
  findOne(@Param('id', ParseIntPipe) id: number) { return this.svc.findOne(this.empresaId, id); }
  @Post()
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR)
  create(@Body() body: CrearGarantiaDto) { return this.svc.create(this.empresaId, body); }
  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR)
  update(@Param('id', ParseIntPipe) id: number, @Body() body: ActualizarGarantiaDto) { return this.svc.update(this.empresaId, id, body); }
}
