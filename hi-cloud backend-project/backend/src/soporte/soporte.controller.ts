import {
  Controller, Get, Post, Body, Param, ParseIntPipe, Query,
  UseGuards, UseInterceptors, UploadedFiles,
  BadRequestException, HttpCode, HttpStatus,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiConsumes } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { SoporteService } from './soporte.service';
import { CreateSoporteTicketDto } from './dto/create-soporte-ticket.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { User } from '../users/users.entity';
import { MAX_ADJUNTOS_POR_TICKET, MAX_BYTES_POR_ADJUNTO, type ArchivoSubido } from './soporte-adjuntos.service';

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

  /**
   * multipart/form-data: asunto, mensaje, url?/modulo?/navegador?/buildId?
   * (aplanados — ver CreateSoporteTicketDto) + hasta 5 archivos en el campo
   * "adjuntos". El fileFilter de aquí solo descarta por el Content-Type que
   * declara el navegador (barato, rechaza pronto lo obviamente equivocado);
   * la validación real por contenido (magic bytes) ocurre en
   * SoporteAdjuntosService, sobre el buffer ya recibido.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 10, ttl: 3_600_000 } }) // 10 tickets por hora por IP
  @ApiOperation({ summary: 'Crear un ticket de soporte, con hasta 5 imágenes adjuntas' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FilesInterceptor('adjuntos', MAX_ADJUNTOS_POR_TICKET, {
    storage: memoryStorage(),
    limits:  { fileSize: MAX_BYTES_POR_ADJUNTO },
    fileFilter: (_req, file, cb) => {
      const permitidos = ['image/jpeg', 'image/png', 'image/webp'];
      if (!permitidos.includes(file.mimetype)) {
        return cb(new BadRequestException('Los adjuntos deben ser imágenes PNG, JPG o WEBP'), false);
      }
      cb(null, true);
    },
  }))
  crear(
    @Body() dto: CreateSoporteTicketDto,
    @GetUser() usuario: User,
    @UploadedFiles() adjuntos?: ArchivoSubido[],
  ) {
    return this.soporteService.crear(dto, usuario, adjuntos ?? []);
  }

  @Get('mis-tickets')
  @ApiOperation({ summary: 'Mis tickets de soporte (empresa activa de esta sesión), con sus adjuntos' })
  misTickets(@Query() pagination: PaginationDto, @GetUser() usuario: User) {
    return this.soporteService.misTickets(usuario, pagination);
  }

  @Get(':ticketId/adjuntos/:adjuntoId/url')
  @ApiOperation({ summary: 'URL firmada de un adjunto — solo si el ticket es propio' })
  urlAdjunto(
    @Param('ticketId', ParseIntPipe) ticketId: number,
    @Param('adjuntoId', ParseIntPipe) adjuntoId: number,
    @GetUser() usuario: User,
  ) {
    return this.soporteService.urlAdjuntoPropio(ticketId, adjuntoId, usuario);
  }
}
