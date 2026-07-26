import { Controller, Get, Post, Patch, Body, Param, Query, ParseIntPipe, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../tenant/tenant.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../users/enums/user-role.enum';
import { ModuloAddonGuard } from '../../modulos-addon/guards/modulo-addon.guard';
import { TenantService } from '../../tenant/tenant.service';
import { PrestamosService } from './prestamos.service';
import { CrearPrestamoDto, CancelarPrestamoDto } from '../dto/prestamista.dto';

@Controller('prestamista/prestamos')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard, ModuloAddonGuard('prestamista'))
@ApiTags('Prestamista - Préstamos')
@ApiBearerAuth()
export class PrestamosController {
  constructor(private readonly svc: PrestamosService, private readonly tenantSvc: TenantService) {}
  private get empresaId() { return this.tenantSvc.getEmpresaId(); }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR, UserRole.VIEWER)
  findAll(@Query() q: any) { return this.svc.findAll(this.empresaId, q); }
  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR, UserRole.VIEWER)
  findOne(@Param('id', ParseIntPipe) id: number) { return this.svc.findOne(this.empresaId, id); }
  // Desembolsar: acción financiera → CONTADOR/ADMIN.
  @Post()
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  create(@Body() body: CrearPrestamoDto) { return this.svc.create(this.empresaId, body); }
  // Simular es solo cálculo (lectura) → cualquier miembro.
  @Post('simular')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR, UserRole.VIEWER)
  simular(@Body() body: any) { return this.svc.simular(body); }
  @Patch(':id/cancelar')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  cancelar(@Param('id', ParseIntPipe) id: number, @Body() body: CancelarPrestamoDto) {
    return this.svc.cancelar(this.empresaId, id, body?.motivo);
  }
  @Patch(':id/recalcular')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  recalcular(@Param('id', ParseIntPipe) id: number) {
    return this.svc.recalcularSaldos(this.empresaId, id);
  }
}
