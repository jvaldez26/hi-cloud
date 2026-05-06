import {
  Controller,
  Get,
  Post,
  Param,
  ParseIntPipe,
  Query,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam } from '@nestjs/swagger';
import { NotificacionesService } from './notificaciones.service';
import { PaginationDto } from '../common/dto/pagination.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/enums/user-role.enum';

@ApiTags('Notificaciones')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.CONTADOR)
@Controller('notificaciones')
export class NotificacionesController {
  constructor(private notificacionesService: NotificacionesService) {}

  @Get('config')
  @ApiOperation({ summary: 'Verificar configuración SMTP y WhatsApp' })
  verificarConfig() {
    return this.notificacionesService.verificarConfiguracion();
  }

  @Get('resumen')
  @ApiOperation({ summary: 'Estadísticas de notificaciones enviadas este mes' })
  getResumen() {
    return this.notificacionesService.getResumenNotificaciones();
  }

  @Get()
  @ApiOperation({ summary: 'Historial de notificaciones enviadas' })
  getNotificaciones(@Query() filtro: PaginationDto) {
    return this.notificacionesService.getNotificaciones(filtro);
  }

  @Post('disparar/:tipo')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Disparar notificación manualmente (cxc | cxp | stock | ecf | resumen)' })
  @ApiParam({ name: 'tipo', enum: ['cxc', 'cxp', 'stock', 'ecf', 'resumen'] })
  disparar(@Param('tipo') tipo: 'cxc' | 'cxp' | 'stock' | 'ecf' | 'resumen') {
    return this.notificacionesService.disparar(tipo);
  }

  @Post('factura/:id/enviar')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR)
  @ApiOperation({ summary: 'Enviar factura por email al cliente' })
  enviarFactura(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { email: string; asunto?: string },
  ) {
    return this.notificacionesService.enviarFacturaAlCliente(id, body.email, body.asunto);
  }

  @Post('factura/:id/whatsapp')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR)
  @ApiOperation({ summary: 'Enviar resumen de factura por WhatsApp' })
  enviarFacturaWhatsApp(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { telefono: string },
  ) {
    return this.notificacionesService.enviarFacturaWhatsApp(id, body.telefono);
  }

  @Post('cliente/:id/estado-cuenta')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR)
  @ApiOperation({ summary: 'Enviar estado de cuenta por email al cliente' })
  enviarEstadoCuenta(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { email: string },
  ) {
    return this.notificacionesService.enviarEstadoCuenta(id, body.email);
  }
}
