import { Controller, Get, Post, Patch, Delete, Body, Param, ParseIntPipe, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../tenant/tenant.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../users/enums/user-role.enum';
import { ModuloAddonGuard } from '../../modulos-addon/guards/modulo-addon.guard';
import { TenantService } from '../../tenant/tenant.service';
import { GetUser } from '../../auth/decorators/get-user.decorator';
import { User } from '../../users/users.entity';
import { GarantesService } from './garantes.service';
import { CrearGaranteDto, ActualizarGaranteDto, LiberarGaranteDto } from '../dto/prestamista.dto';

@Controller('prestamista/garantes')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard, ModuloAddonGuard('prestamista'))
@ApiTags('Prestamista - Garantes')
@ApiBearerAuth()
export class GarantesController {
  constructor(private readonly svc: GarantesService, private readonly tenantSvc: TenantService) {}
  private get empresaId() { return this.tenantSvc.getEmpresaId(); }

  @Get('prestamo/:prestamoId')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR, UserRole.VIEWER)
  findByPrestamo(@Param('prestamoId', ParseIntPipe) id: number) {
    return this.svc.findByPrestamo(this.empresaId, id);
  }
  @Get('solicitud/:solicitudId')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR, UserRole.VIEWER)
  findBySolicitud(@Param('solicitudId', ParseIntPipe) id: number) {
    return this.svc.findBySolicitud(this.empresaId, id);
  }
  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR, UserRole.VIEWER)
  findOne(@Param('id', ParseIntPipe) id: number) { return this.svc.findOne(this.empresaId, id); }

  @Post()
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR)
  create(@Body() body: CrearGaranteDto) { return this.svc.create(this.empresaId, body); }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR)
  update(@Param('id', ParseIntPipe) id: number, @Body() body: ActualizarGaranteDto) {
    return this.svc.update(this.empresaId, id, body);
  }

  // Nunca automático — un ADMIN/CONTADOR libera a mano (§2). No requiere
  // supervisor adicional: no mueve dinero, es una acción de rutina del rol.
  @Patch(':id/liberar')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  liberar(@Param('id', ParseIntPipe) id: number, @Body() body: LiberarGaranteDto, @GetUser() usuario: User) {
    return this.svc.liberar(this.empresaId, id, body.motivo, { id: usuario.id, nombre: usuario.nombre });
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  remove(@Param('id', ParseIntPipe) id: number) { return this.svc.remove(this.empresaId, id); }
}
