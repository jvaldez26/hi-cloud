import {
  Controller,
  Post,
  Patch,
  Get,
  Body,
  Param,
  ParseIntPipe,
  Res,
  BadRequestException,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { UseGuards } from '@nestjs/common';
import { XlinkRecibirService } from './xlink-recibir.service';
import { XlinkMapeosService } from './xlink-mapeos.service';
import { RecibirXlinkDto } from './dto/recibir-xlink.dto';
import { GuardarMapeosXlinkDto } from './dto/guardar-mapeos-xlink.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { User } from '../users/users.entity';

@ApiTags('HiCloud Xlink')
@Controller('xlink')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('access-token')
export class XlinkRecibirController {
  constructor(
    private xlinkRecibirService: XlinkRecibirService,
    private xlinkMapeosService: XlinkMapeosService,
  ) {}

  @Post('recibir')
  @ApiOperation({ summary: 'Recibe documentos publicados por otra empresa — cada uno en su propia transacción' })
  recibir(@Body() dto: RecibirXlinkDto, @GetUser() usuario: User) {
    return this.xlinkRecibirService.recibir(dto, usuario);
  }

  @Post('mapeos')
  @ApiOperation({ summary: 'Guarda homologaciones (producto/unidad/impuesto/término/retención) por contraparte' })
  guardarMapeos(@Body() dto: GuardarMapeosXlinkDto) {
    return this.xlinkMapeosService.guardarMapeos(dto);
  }

  @Patch(':id/marcar-procesado')
  @ApiOperation({ summary: 'Marca un documento recibido como resuelto manualmente, sin generar nada' })
  marcarProcesado(@Param('id', ParseIntPipe) id: number, @GetUser() usuario: User) {
    return this.xlinkRecibirService.marcarProcesadoManual(id, usuario);
  }

  @Patch(':id/descartar')
  @ApiOperation({ summary: 'Descarta un documento pendiente' })
  descartar(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { motivo: string },
    @GetUser() usuario: User,
  ) {
    if (!body?.motivo?.trim()) throw new BadRequestException('El motivo es obligatorio');
    return this.xlinkRecibirService.descartar(id, body.motivo, usuario);
  }

  @Patch(':id/regresar-pendiente')
  @ApiOperation({ summary: 'Regresa un documento descartado o marcado manual a pendiente' })
  regresarPendiente(@Param('id', ParseIntPipe) id: number) {
    return this.xlinkRecibirService.regresarPendiente(id);
  }

  @Get(':id/pdf-original')
  @ApiOperation({ summary: 'PDF del documento tal como lo generó el emisor' })
  async getPdfOriginal(@Param('id', ParseIntPipe) id: number, @Res() res: Response) {
    const { buffer, filename } = await this.xlinkRecibirService.getPdfOriginal(id);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${filename}"` });
    res.send(buffer);
  }

  @Get(':id/formulario')
  @ApiOperation({ summary: 'DTO prellenado para abrir el formulario normal en modo nuevo, sin grabar' })
  getFormulario(@Param('id', ParseIntPipe) id: number) {
    return this.xlinkRecibirService.getFormulario(id);
  }
}
