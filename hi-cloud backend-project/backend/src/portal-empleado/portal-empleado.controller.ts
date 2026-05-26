import { Controller, Get, Post, Body, UseGuards, HttpCode, HttpStatus, Logger, ForbiddenException } from '@nestjs/common';
import { IsString, IsOptional, IsDateString } from 'class-validator';

class SolicitudVacacionesDto {
  @IsDateString()   fechaInicio!: string;
  @IsDateString()   fechaFin!:    string;
  @IsOptional() @IsString() motivo?: string;
}
import { ApiTags, ApiBearerAuth, ApiOperation, ApiHeader } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { User } from '../users/users.entity';
import { UserRole } from '../users/enums/user-role.enum';
import { PortalEmpleadoService } from './portal-empleado.service';

// Roles que pueden acceder al portal del empleado
// EMPLEADO: solo sus propios datos. Admin/Contador: pueden ver cualquier empleado.
const PORTAL_ROLES = [
  UserRole.EMPLEADO,
  UserRole.ADMIN,
  UserRole.CONTADOR,
  UserRole.SUPER_ADMIN,
];

@ApiTags('Portal del Empleado')
@ApiBearerAuth('access-token')
@ApiHeader({ name: 'X-Empresa-ID', required: true })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...PORTAL_ROLES)
@Controller('portal-empleado')
export class PortalEmpleadoController {
  private readonly logger = new Logger(PortalEmpleadoController.name);
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

  @Get('mis-solicitudes')
  @ApiOperation({ summary: 'Solicitudes de vacaciones/permisos del empleado' })
  misSolicitudes(@GetUser() user: User) {
    return this.svc.getMisSolicitudes(user.id);
  }

  @Post('solicitar-vacaciones')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Crear solicitud de vacaciones o permiso' })
  solicitarVacaciones(@GetUser() user: User, @Body() dto: SolicitudVacacionesDto) {
    return this.svc.crearSolicitud(user.id, dto);
  }

  @Get('mi-contrato-laboral')
  @ApiOperation({ summary: 'Contrato laboral activo más reciente del empleado' })
  miContratoLaboral(@GetUser() user: User) {
    return this.svc.getMiContratoLaboral(user.id);
  }

  @Get('carta-trabajo')
  @ApiOperation({ summary: 'Genera carta de trabajo / certificación laboral del empleado' })
  cartaTrabajo(@GetUser() user: User) {
    return this.svc.generarCartaTrabajo(user.id);
  }

  @Post('solicitar-vinculacion')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Empleado solicita que el admin lo vincule con su usuario de sistema' })
  async solicitarVinculacion(@GetUser() user: User) {
    // Notifica al admin por email/log — el admin debe ir a Nómina → Empleados y vincular
    this.logger.log(
      `Solicitud de vinculación: usuario #${user.id} (${user.email}) empresa ID pendiente verificación`
    );
    return this.svc.solicitarVinculacion(user.id);
  }
}
