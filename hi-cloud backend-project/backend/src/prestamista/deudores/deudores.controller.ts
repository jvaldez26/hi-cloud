import { Controller, Get, Post, Patch, Delete, Body, Param, Query, ParseIntPipe, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../tenant/tenant.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../users/enums/user-role.enum';
import { ModuloAddonGuard } from '../../modulos-addon/guards/modulo-addon.guard';
import { TenantService } from '../../tenant/tenant.service';
import { DeudoresService } from './deudores.service';
import { CrearDeudorDto, ActualizarDeudorDto } from '../dto/prestamista.dto';

@Controller('prestamista/deudores')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard, ModuloAddonGuard('prestamista'))
@ApiTags('Prestamista - Deudores')
@ApiBearerAuth()
export class DeudoresController {
  constructor(private readonly svc: DeudoresService, private readonly tenantSvc: TenantService) {}
  private get empresaId() { return this.tenantSvc.getEmpresaId(); }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR, UserRole.VIEWER)
  findAll(@Query() q: any) { return this.svc.findAll(this.empresaId, q); }
  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR, UserRole.VIEWER)
  findOne(@Param('id', ParseIntPipe) id: number) { return this.svc.findOne(this.empresaId, id); }
  // Registrar deudor: operador básico o superior.
  @Post()
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR)
  create(@Body() body: CrearDeudorDto) { return this.svc.create(this.empresaId, body); }
  // PATCH es el vehículo de quitar de lista negra / reactivar (enListaNegra, isActive)
  // → acción sensible: CONTADOR/ADMIN.
  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  update(@Param('id', ParseIntPipe) id: number, @Body() body: ActualizarDeudorDto) { return this.svc.update(this.empresaId, id, body); }
  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  remove(@Param('id', ParseIntPipe) id: number) { return this.svc.remove(this.empresaId, id); }
}
