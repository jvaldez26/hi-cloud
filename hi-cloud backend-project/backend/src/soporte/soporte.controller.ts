import { Controller, Get, Post, Body, Query, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { SoporteService } from './soporte.service';
import { CreateSoporteTicketDto } from './dto/create-soporte-ticket.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { User } from '../users/users.entity';

/**
 * Ticket de soporte de un usuario autenticado — visible para TODOS los
 * roles (cualquiera puede necesitar ayuda). No confundir con
 * POST /auth/contacto-soporte (formulario público, sin login).
 */
@ApiTags('Soporte')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('soporte/tickets')
export class SoporteController {
  constructor(private soporteService: SoporteService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 10, ttl: 3_600_000 } }) // 10 tickets por hora por IP
  @ApiOperation({ summary: 'Crear un ticket de soporte' })
  crear(@Body() dto: CreateSoporteTicketDto, @GetUser() usuario: User) {
    return this.soporteService.crear(dto, usuario);
  }

  @Get('mis-tickets')
  @ApiOperation({ summary: 'Mis tickets de soporte (empresa activa de esta sesión)' })
  misTickets(@Query() pagination: PaginationDto, @GetUser() usuario: User) {
    return this.soporteService.misTickets(usuario, pagination);
  }
}
