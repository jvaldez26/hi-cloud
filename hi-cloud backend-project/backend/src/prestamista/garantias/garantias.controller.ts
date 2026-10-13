import { Controller, Get, Post, Patch, Body, Param, ParseIntPipe, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../tenant/tenant.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../users/enums/user-role.enum';
import { ModuloAddonGuard } from '../../modulos-addon/guards/modulo-addon.guard';
import { RequiereSupervisorSiempre } from '../../supervisor-politicas/guards/requiere-supervisor-siempre.guard';
import { TenantService } from '../../tenant/tenant.service';
import { GetUser } from '../../auth/decorators/get-user.decorator';
import { User } from '../../users/users.entity';
import { GarantiasService } from './garantias.service';
import { CrearGarantiaDto, ActualizarGarantiaDto, LiberarGarantiaDto, EjecutarGarantiaDto } from '../dto/prestamista.dto';

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

  // Caso normal (el préstamo se pagó) — no mueve dinero, no requiere supervisor.
  @Patch(':id/liberar')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  liberar(@Param('id', ParseIntPipe) id: number, @Body() body: LiberarGarantiaDto, @GetUser() usuario: User) {
    return this.svc.liberar(this.empresaId, id, body.motivo, { id: usuario.id, nombre: usuario.nombre });
  }

  // La acción más grave del módulo — el banco se queda con el bien. Requiere
  // la autorización de OTRA persona, incluso para el propio ADMIN (§3).
  @Patch(':id/ejecutar')
  @Roles(UserRole.ADMIN)
  @UseGuards(RequiereSupervisorSiempre('ejecutar_garantia'))
  ejecutar(@Param('id', ParseIntPipe) id: number, @Body() body: EjecutarGarantiaDto, @GetUser() usuario: User) {
    return this.svc.ejecutar(this.empresaId, id, body.motivo, { id: usuario.id, nombre: usuario.nombre });
  }
}
