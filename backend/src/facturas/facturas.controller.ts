import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
  UseGuards,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { FacturasService } from './facturas.service';
import { PDFService } from './services/pdf.service';
import { CreateFacturaDto } from './dto/create-factura.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { User } from '../users/users.entity';
import { FacturaEstado } from './entities/factura.entity';
import { IsEnum } from 'class-validator';

class CambiarEstadoDto {
  @IsEnum(FacturaEstado)
  estado: FacturaEstado;
}

@ApiTags('Facturas')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('facturas')
export class FacturasController {
  constructor(
    private facturasService: FacturasService,
    private pdfService:      PDFService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR)
  @ApiOperation({ summary: 'Crear factura' })
  create(@Body() dto: CreateFacturaDto, @GetUser() usuario: User) {
    return this.facturasService.create(dto, usuario);
  }

  @Get()
  @ApiOperation({ summary: 'Listar facturas con paginación' })
  findAll(@Query() pagination: PaginationDto) {
    return this.facturasService.findAll(pagination);
  }

  @Get('resumen')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Resumen de facturas por estado' })
  resumen() {
    return this.facturasService.resumenPorEstado();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener factura por ID con detalles' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.facturasService.findOne(id);
  }

  @Patch(':id/estado')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Cambiar estado de la factura' })
  cambiarEstado(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CambiarEstadoDto,
  ) {
    return this.facturasService.cambiarEstado(id, dto.estado);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Eliminar factura (solo borradores)' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.facturasService.remove(id);
  }

  // ── PDF ────────────────────────────────────────────────────────────

  @Get(':id/pdf')
  @ApiOperation({ summary: 'Descargar factura en PDF (A4 profesional)' })
  async descargarPDF(
    @Param('id', ParseIntPipe) id: number,
    @Res() res: Response,
  ) {
    const { buffer, filename } = await this.pdfService.generarFacturaPDF(id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.length);
    res.end(buffer);
  }

  @Get(':id/preview')
  @ApiOperation({ summary: 'Vista previa HTML de la factura en navegador' })
  async previewHTML(
    @Param('id', ParseIntPipe) id: number,
    @Res() res: Response,
  ) {
    const html = await this.pdfService.generarFacturaHTML(id);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(html);
  }

  @Get(':id/recibo-pdf')
  @ApiOperation({ summary: 'Recibo térmico POS 80mm en PDF' })
  async reciboPDF(
    @Param('id', ParseIntPipe) id: number,
    @Res() res: Response,
  ) {
    const { buffer, filename } = await this.pdfService.generarReciboPOS(id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.length);
    res.end(buffer);
  }
}
