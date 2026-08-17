import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Patch,
  Param,
  Body,
  ParseIntPipe,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { VideosTutorialesService } from './videos-tutoriales.service';
import { CreateVideoTutorialDto } from './dto/create-video-tutorial.dto';
import { UpdateVideoTutorialDto } from './dto/update-video-tutorial.dto';
import { ReorderVideosDto } from './dto/reorder-videos.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SuperAdminGuard } from '../super-admin/super-admin.guard';

@ApiTags('Videos Tutoriales')
@Controller('videos-tutoriales')
export class VideosTutorialesController {
  constructor(private readonly svc: VideosTutorialesService) {}

  /**
   * Endpoint público (solo requiere JWT) — todos los usuarios autenticados.
   * Devuelve mapa {modulo → {titulo, proveedor, videoId, duracionSegundos}}.
   * Solo videos activos. El front lo cachea 5 min para no saturar con 83 llamadas.
   */
  @Get('publico')
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Mapa de videos activos por módulo — para VideoTutorialButton' })
  findPublico() {
    return this.svc.findPublico();
  }

  // ── SuperAdmin endpoints ──────────────────────────────────────────────────

  @Get()
  @ApiBearerAuth('access-token')
  @UseGuards(SuperAdminGuard)
  @ApiOperation({ summary: 'SuperAdmin: listar todos los videos (activos e inactivos)' })
  findAll() {
    return this.svc.findAll();
  }

  @Post()
  @ApiBearerAuth('access-token')
  @UseGuards(SuperAdminGuard)
  @ApiOperation({ summary: 'SuperAdmin: crear video tutorial' })
  create(@Body() dto: CreateVideoTutorialDto) {
    return this.svc.create(dto);
  }

  @Put(':id')
  @ApiBearerAuth('access-token')
  @UseGuards(SuperAdminGuard)
  @ApiOperation({ summary: 'SuperAdmin: actualizar video tutorial' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateVideoTutorialDto,
  ) {
    return this.svc.update(id, dto);
  }

  @Delete(':id')
  @ApiBearerAuth('access-token')
  @UseGuards(SuperAdminGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'SuperAdmin: eliminar video tutorial' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.svc.remove(id);
  }

  @Patch('reorder')
  @ApiBearerAuth('access-token')
  @UseGuards(SuperAdminGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'SuperAdmin: reordenar videos en lote' })
  reorder(@Body() dto: ReorderVideosDto) {
    return this.svc.reorder(dto);
  }

  @Patch(':id/toggle-activo')
  @ApiBearerAuth('access-token')
  @UseGuards(SuperAdminGuard)
  @ApiOperation({ summary: 'SuperAdmin: activar/desactivar video' })
  toggleActivo(@Param('id', ParseIntPipe) id: number) {
    return this.svc.toggleActivo(id);
  }
}
