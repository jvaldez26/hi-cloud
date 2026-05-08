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
  @ApiOperation({ summary: 'Disparar notificación manualmente (cxc | cxp | stock | ecf | resumen | recordatorios-clientes)' })
  @ApiParam({ name: 'tipo', enum: ['cxc', 'cxp', 'stock', 'ecf', 'resumen', 'recordatorios-clientes'] })
  disparar(@Param('tipo') tipo: 'cxc' | 'cxp' | 'stock' | 'ecf' | 'resumen' | 'recordatorios-clientes' | 'resumen-empresas') {
    if (tipo === 'recordatorios-clientes') {
      return this.notificacionesService.cronRecordatoriosClientesCxC().then(v => ({ enviados: v ?? 0 }));
    }
    if (tipo === 'resumen-empresas') {
      return this.notificacionesService.cronResumenSemanalPorEmpresa().then(() => ({ ok: true }));
    }
    return this.notificacionesService.disparar(tipo as any);
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

  @Post('cotizacion/:id/enviar')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR)
  @ApiOperation({ summary: 'Enviar cotización por email al cliente' })
  enviarCotizacion(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { email: string; asunto?: string },
  ) {
    return this.notificacionesService.enviarCotizacionAlCliente(id, body.email, body.asunto);
  }

  @Post('recibo/:id/enviar')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR)
  @ApiOperation({ summary: 'Enviar recibo de cobro por email al cliente' })
  enviarRecibo(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { email: string },
  ) {
    return this.notificacionesService.enviarReciboAlCliente(id, body.email);
  }

  @Post('compra/:id/enviar')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Enviar orden de compra por email al proveedor' })
  enviarCompra(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { email: string },
  ) {
    return this.notificacionesService.enviarCompraAlProveedor(id, body.email);
  }

  @Post('nota-credito/:id/enviar')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR)
  @ApiOperation({ summary: 'Enviar nota de crédito por email al cliente' })
  enviarNotaCredito(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { email: string },
  ) {
    return this.notificacionesService.enviarNotaCreditoAlCliente(id, body.email);
  }

  @Post('nota-debito/:id/enviar')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR)
  @ApiOperation({ summary: 'Enviar nota de débito por email al cliente' })
  enviarNotaDebito(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { email: string },
  ) {
    return this.notificacionesService.enviarNotaDebitoAlCliente(id, body.email);
  }

  @Post('pre-factura/:id/enviar')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR)
  @ApiOperation({ summary: 'Enviar pre-factura (proforma) por email al cliente' })
  enviarPreFactura(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { email: string },
  ) {
    return this.notificacionesService.enviarPreFacturaAlCliente(id, body.email);
  }
}
