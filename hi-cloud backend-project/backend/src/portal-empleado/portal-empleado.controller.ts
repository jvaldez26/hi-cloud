import { Controller, Get, Post, Body, UseGuards, HttpCode, HttpStatus, Logger } from '@nestjs/common';
import { IsString, IsOptional, IsDateString } from 'class-validator';

class SolicitudVacacionesDto {
  @IsDateString()   fechaInicio!: string;
  @IsDateString()   fechaFin!:    string;
  @IsOptional() @IsString() motivo?: string;
}
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
