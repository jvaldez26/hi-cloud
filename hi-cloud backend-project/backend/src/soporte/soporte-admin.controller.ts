import { Controller, Get, Patch, Body, Param, Query, ParseIntPipe, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { SoporteService } from './soporte.service';
import { FiltroSoporteTicketsDto } from './dto/filtro-soporte-tickets.dto';
import { ResponderTicketDto } from './dto/responder-ticket.dto';
import { EstadoTicketSoporte, PrioridadTicketSoporte } from './entities/soporte-ticket.entity';
import { SuperAdminGuard } from '../super-admin/super-admin.guard';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { User } from '../users/users.entity';

class CambiarEstadoTicketDto {
  @IsEnum(EstadoTicketSoporte)
  estado!: EstadoTicketSoporte;
}

class CambiarPrioridadTicketDto {
  @IsEnum(PrioridadTicketSoporte)
  prioridad!: PrioridadTicketSoporte;
}

/** Panel de Super Admin — cross-tenant a propósito, sin scope de empresa. */
@ApiTags('Super Admin — Soporte')
@ApiBearerAuth('access-token')
@UseGuards(SuperAdminGuard)
@Controller('super-admin/soporte-tickets')
export class SoporteAdminController {
  constructor(private soporteService: SoporteService) {}

  @Get()
  @ApiOperation({ summary: 'Listar tickets de soporte de todas las empresas, con filtros' })
  listar(@Query() filtro: FiltroSoporteTicketsDto) {
    return this.soporteService.listarParaAdmin(filtro);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de un ticket, incluido el contexto automático capturado' })
  detalle(@Param('id', ParseIntPipe) id: number) {
    return this.soporteService.detalle(id);
  }

  @Patch(':id/responder')
  @ApiOperation({ summary: 'Responder un ticket — lo pasa a Resuelto y avisa por correo al usuario' })
  responder(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ResponderTicketDto,
    @GetUser() admin: User,
  ) {
    return this.soporteService.responder(id, dto, admin);
  }

  @Patch(':id/estado')
  @ApiOperation({ summary: 'Cambiar el estado del ticket (ej. En proceso, Cerrado) sin escribir una respuesta' })
  cambiarEstado(@Param('id', ParseIntPipe) id: number, @Body() dto: CambiarEstadoTicketDto) {
    return this.soporteService.cambiarEstado(id, dto.estado);
  }

  @Patch(':id/prioridad')
  @ApiOperation({ summary: 'Asignar prioridad al ticket' })
  cambiarPrioridad(@Param('id', ParseIntPipe) id: number, @Body() dto: CambiarPrioridadTicketDto) {
    return this.soporteService.cambiarPrioridad(id, dto.prioridad);
  }
}
