import { Controller, Patch, Body, Param, ParseIntPipe, UseGuards } from '@nestjs/common';
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
import { ReestructuracionService } from './reestructuracion.service';
import { ReestructurarPrestamoDto } from '../dto/prestamista.dto';

@Controller('prestamista/prestamos')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard, ModuloAddonGuard('prestamista'))
@ApiTags('Prestamista - Reestructuración')
@ApiBearerAuth()
export class ReestructuracionController {
  constructor(private readonly svc: ReestructuracionService, private readonly tenantSvc: TenantService) {}
  private get empresaId() { return this.tenantSvc.getEmpresaId(); }

  // Cambia lo que el deudor va a pagar — supervisor SIEMPRE (§5), ni el
  // propio ADMIN que la hace puede autorizarse a sí mismo.
  @Patch(':id/reestructurar')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @UseGuards(RequiereSupervisorSiempre('reestructurar_prestamo'))
  reestructurar(@Param('id', ParseIntPipe) id: number, @Body() body: ReestructurarPrestamoDto, @GetUser() usuario: User) {
    return this.svc.reestructurar(this.empresaId, id, body, { id: usuario.id, nombre: usuario.nombre });
  }
}
