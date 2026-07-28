import { Controller, Get, Post, Body, Param, ParseIntPipe, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../tenant/tenant.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../users/enums/user-role.enum';
import { ModuloAddonGuard } from '../../modulos-addon/guards/modulo-addon.guard';
import { TenantService } from '../../tenant/tenant.service';
import { CosechasService } from './cosechas.service';
import { CrearCosechaDto } from '../dto/agro.dto';

@Controller('agro/cosechas')
@UseGuards(JwtAuthGuard, RolesGuard, TenantGuard, ModuloAddonGuard('agro'))
export class CosechasController {
  constructor(private readonly svc: CosechasService, private readonly tenantSvc: TenantService) {}
  private get empresaId() { return this.tenantSvc.getEmpresaId(); }

  @Get()       @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR, UserRole.VIEWER)
  findAll(@Query() q: any)   { return this.svc.findAll(this.empresaId, q); }
  @Post()      @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR)
  create(@Body() body: CrearCosechaDto)  { return this.svc.create(this.empresaId, body); }
  @Get(':id')  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR, UserRole.VIEWER)
  findOne(@Param('id', ParseIntPipe) id: number) { return this.svc.findOne(this.empresaId, id); }
  // Acción sensible: ingreso a inventario (afecta stock del ERP) → solo ADMIN/CONTADOR
  @Post(':id/ingresar-inventario') @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  ingresarInv(@Param('id', ParseIntPipe) id: number) {
    return this.svc.ingresarInventario(this.empresaId, id);
  }
}
