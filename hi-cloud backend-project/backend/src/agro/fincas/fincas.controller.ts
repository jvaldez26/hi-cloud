import { Controller, Get, Post, Patch, Body, Param, ParseIntPipe, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../tenant/tenant.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../users/enums/user-role.enum';
import { ModuloAddonGuard } from '../../modulos-addon/guards/modulo-addon.guard';
import { TenantService } from '../../tenant/tenant.service';
import { FincasService } from './fincas.service';
import {
  CrearFincaDto, ActualizarFincaDto,
  CrearParcelaDto, ActualizarParcelaDto,
} from '../dto/agro.dto';

@Controller('agro/fincas')
@UseGuards(JwtAuthGuard, RolesGuard, TenantGuard, ModuloAddonGuard('agro'))
export class FincasController {
  constructor(private readonly svc: FincasService, private readonly tenantSvc: TenantService) {}
  private get empresaId() { return this.tenantSvc.getEmpresaId(); }

  @Get()       @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR, UserRole.VIEWER)
  findAll()                                    { return this.svc.findAll(this.empresaId); }
  @Get(':id')  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR, UserRole.VIEWER)
  findOne(@Param('id', ParseIntPipe) id: number) { return this.svc.findOne(this.empresaId, id); }
  @Post()      @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR)
  create(@Body() body: CrearFincaDto)                    { return this.svc.create(this.empresaId, body); }
  @Patch(':id') @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR)
  update(@Param('id', ParseIntPipe) id: number, @Body() body: ActualizarFincaDto) { return this.svc.update(this.empresaId, id, body); }

  @Get(':id/parcelas') @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR, UserRole.VIEWER)
  findParcelas(@Param('id', ParseIntPipe) id: number) {
    return this.svc.findParcelas(this.empresaId, id);
  }
}

// ── Parcelas como sub-recurso independiente ──────────────────────────────────
import { Controller as Ctrl } from '@nestjs/common';

@Ctrl('agro/parcelas')
@UseGuards(JwtAuthGuard, RolesGuard, TenantGuard, ModuloAddonGuard('agro'))
export class ParcelasController {
  constructor(private readonly svc: FincasService, private readonly tenantSvc: TenantService) {}
  private get empresaId() { return this.tenantSvc.getEmpresaId(); }

  @Get()       @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR, UserRole.VIEWER)
  findAll(@Query() q: any)   { return this.svc.findParcelas(this.empresaId); }
  @Post()      @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR)
  create(@Body() body: CrearParcelaDto)  { return this.svc.createParcela(this.empresaId, body); }
  @Patch(':id') @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR)
  update(@Param('id', ParseIntPipe) id: number, @Body() body: ActualizarParcelaDto) {
    return this.svc.updateParcela(this.empresaId, id, body);
  }
}
