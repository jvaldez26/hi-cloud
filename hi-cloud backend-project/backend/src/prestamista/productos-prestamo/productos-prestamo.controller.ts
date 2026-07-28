import { Controller, Get, Post, Patch, Delete, Body, Param, ParseIntPipe, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../tenant/tenant.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../users/enums/user-role.enum';
import { ModuloAddonGuard } from '../../modulos-addon/guards/modulo-addon.guard';
import { TenantService } from '../../tenant/tenant.service';
import { ProductosPrestamoService } from './productos-prestamo.service';
import { CrearProductoPrestamoDto, ActualizarProductoPrestamoDto } from '../dto/prestamista.dto';

@Controller('prestamista/productos-prestamo')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard, ModuloAddonGuard('prestamista'))
@ApiTags('Prestamista - Productos')
@ApiBearerAuth()
export class ProductosPrestamoController {
  constructor(private readonly svc: ProductosPrestamoService, private readonly tenantSvc: TenantService) {}
  private get empresaId() { return this.tenantSvc.getEmpresaId(); }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR, UserRole.VIEWER)
  findAll() { return this.svc.findAll(this.empresaId); }
  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR, UserRole.VIEWER)
  findOne(@Param('id', ParseIntPipe) id: number) { return this.svc.findOne(this.empresaId, id); }
  // Config del producto financiero (tasa, plazo, mora) → CONTADOR/ADMIN.
  @Post()
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  create(@Body() body: CrearProductoPrestamoDto) { return this.svc.create(this.empresaId, body); }
  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  update(@Param('id', ParseIntPipe) id: number, @Body() body: ActualizarProductoPrestamoDto) { return this.svc.update(this.empresaId, id, body); }
  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  remove(@Param('id', ParseIntPipe) id: number) { return this.svc.remove(this.empresaId, id); }
}
