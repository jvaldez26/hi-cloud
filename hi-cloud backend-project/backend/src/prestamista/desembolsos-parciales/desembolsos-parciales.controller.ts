import { Controller, Get, Post, Body, Param, ParseIntPipe, UseGuards } from '@nestjs/common';
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
import { DesembolsosParcialesService } from './desembolsos-parciales.service';
import { CrearDesembolsoParcialDto } from '../dto/prestamista.dto';

@Controller('prestamista/desembolsos-parciales')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard, ModuloAddonGuard('prestamista'))
@ApiTags('Prestamista - Desembolsos Parciales')
@ApiBearerAuth()
export class DesembolsosParcialesController {
  constructor(private readonly svc: DesembolsosParcialesService, private readonly tenantSvc: TenantService) {}
  private get empresaId() { return this.tenantSvc.getEmpresaId(); }

  @Get('prestamo/:prestamoId')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR, UserRole.VIEWER)
  findByPrestamo(@Param('prestamoId', ParseIntPipe) id: number) {
    return this.svc.findByPrestamo(this.empresaId, id);
  }

  // Igual nivel que desembolsar un préstamo (PrestamosController.create): CONTADOR/ADMIN.
  @Post()
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  registrar(@Body() body: CrearDesembolsoParcialDto, @GetUser() usuario: User) {
    return this.svc.registrar(this.empresaId, body, { id: usuario.id, nombre: usuario.nombre });
  }
}
