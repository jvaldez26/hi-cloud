import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiHeader } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { User } from '../users/users.entity';
import { PortalEmpleadoService } from './portal-empleado.service';

@ApiTags('Portal del Empleado')
@ApiBearerAuth('access-token')
@ApiHeader({ name: 'X-Empresa-ID', required: true })
@UseGuards(JwtAuthGuard)
@Controller('portal-empleado')
export class PortalEmpleadoController {
  constructor(private readonly svc: PortalEmpleadoService) {}

  @Get('mi-perfil')
  @ApiOperation({ summary: 'Datos personales y laborales del empleado logueado' })
  miPerfil(@GetUser() user: User) {
    return this.svc.getMiPerfil(user.id);
  }

  @Get('mis-nominas')
  @ApiOperation({ summary: 'Historial de recibos de nómina del empleado logueado' })
  misNominas(@GetUser() user: User) {
    return this.svc.getMisNominas(user.id);
  }

  @Get('mi-resumen')
  @ApiOperation({ summary: 'Resumen financiero mensual: bruto, deducciones ISR/TSS, neto' })
  miResumen(@GetUser() user: User) {
    return this.svc.getMiResumen(user.id);
  }

  @Get('mis-vacaciones')
  @ApiOperation({ summary: 'Saldo de vacaciones y solicitudes (Ley 16-92 RD)' })
  misVacaciones(@GetUser() user: User) {
    return this.svc.getMisVacaciones(user.id);
  }
}
