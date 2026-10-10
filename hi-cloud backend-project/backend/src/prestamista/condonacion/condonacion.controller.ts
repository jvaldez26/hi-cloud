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
import { CondonacionService } from './condonacion.service';
import { CondonarPrestamoDto } from '../dto/prestamista.dto';

@Controller('prestamista/prestamos')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard, ModuloAddonGuard('prestamista'))
@ApiTags('Prestamista - Condonación')
@ApiBearerAuth()
export class CondonacionController {
  constructor(private readonly svc: CondonacionService, private readonly tenantSvc: TenantService) {}
  private get empresaId() { return this.tenantSvc.getEmpresaId(); }

  // Solo ADMIN (acción grave, perdona deuda) + supervisor SIEMPRE (§6).
  @Patch(':id/condonar')
  @Roles(UserRole.ADMIN)
  @UseGuards(RequiereSupervisorSiempre('condonar_prestamo'))
  condonar(@Param('id', ParseIntPipe) id: number, @Body() body: CondonarPrestamoDto, @GetUser() usuario: User) {
    return this.svc.condonar(this.empresaId, id, body, { id: usuario.id, nombre: usuario.nombre });
  }
}
