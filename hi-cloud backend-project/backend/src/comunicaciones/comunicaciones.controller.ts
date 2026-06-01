import {
  Controller, Get, Param, Query, ParseIntPipe, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiHeader } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { ComunicacionesService } from './comunicaciones.service';

@ApiTags('WhatsApp & Comunicaciones')
@ApiBearerAuth('access-token')
@ApiHeader({ name: 'X-Empresa-ID', required: true })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR)
@Controller('comunicaciones')
export class ComunicacionesController {
  constructor(private readonly svc: ComunicacionesService) {}

  @Get('plantillas')
  @ApiOperation({ summary: 'Plantillas de mensajes WhatsApp configurables' })
  plantillas() { return this.svc.getPlantillas(); }

  @Get('whatsapp/factura/:id')
  @ApiOperation({ summary: 'Genera link wa.me para compartir una factura' })
  mensajeFactura(
    @Param('id', ParseIntPipe) id: number,
    @Query('appUrl') appUrl?: string,
  ) {
    return this.svc.mensajeFactura(id, appUrl);
  }

  @Get('whatsapp/cotizacion/:id')
  @ApiOperation({ summary: 'Genera link wa.me para compartir una cotización' })
  mensajeCotizacion(
    @Param('id', ParseIntPipe) id: number,
    @Query('appUrl') appUrl?: string,
  ) {
    return this.svc.mensajeCotizacion(id, appUrl);
  }

  @Get('whatsapp/conduce/:id')
  @ApiOperation({ summary: 'Genera link wa.me para notificar envío de un conduce' })
  mensajeConduce(@Param('id', ParseIntPipe) id: number) {
    return this.svc.mensajeConduce(id);
  }

  @Get('whatsapp/cxc/:id')
  @ApiOperation({ summary: 'Genera link wa.me de recordatorio de cobro para una CxC' })
  recordatorioCxC(@Param('id', ParseIntPipe) id: number) {
    return this.svc.recordatorioCxC(id);
  }

  @Get('whatsapp/nota-credito/:id')
  @ApiOperation({ summary: 'Genera link wa.me para compartir una Nota de Crédito E34' })
  mensajeNotaCredito(
    @Param('id', ParseIntPipe) id: number,
    @Query('apiBaseUrl') apiBaseUrl?: string,
  ) {
    return this.svc.mensajeNotaCredito(id, apiBaseUrl);
  }

  @Get('whatsapp/nota-debito/:id')
  @ApiOperation({ summary: 'Genera link wa.me para compartir una Nota de Débito E33' })
  mensajeNotaDebito(
    @Param('id', ParseIntPipe) id: number,
    @Query('apiBaseUrl') apiBaseUrl?: string,
  ) {
    return this.svc.mensajeNotaDebito(id, apiBaseUrl);
  }

  @Get('cxc-pendientes')
  @ApiOperation({ summary: 'Lista CxC pendientes/vencidas para enviar recordatorios masivos' })
  listaCxCPendientes() { return this.svc.listaCxCPendientes(); }
}
