import {
  Controller, Post, Get, UploadedFile, BadRequestException,
  UseInterceptors, Res, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiConsumes } from '@nestjs/swagger';
import type { Response } from 'express';
import { ImportacionService } from './importacion.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/enums/user-role.enum';

@ApiTags('Importación Masiva')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.CONTADOR)
@Controller('importacion')
export class ImportacionController {
  constructor(private importacionService: ImportacionService) {}

  // ── Plantillas ──────────────────────────────────────────────────────────────

  @Get('plantilla/clientes')
  @ApiOperation({ summary: 'Descargar plantilla CSV para importar clientes' })
  descargarPlantillaClientes(@Res() res: Response) {
    const csv = this.importacionService.getPlantillaClientes();
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="plantilla-clientes.csv"');
    res.send('﻿' + csv); // BOM para compatibilidad con Excel
  }

  @Get('plantilla/productos')
  @ApiOperation({ summary: 'Descargar plantilla CSV para importar productos' })
  descargarPlantillaProductos(@Res() res: Response) {
    const csv = this.importacionService.getPlantillaProductos();
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="plantilla-productos.csv"');
    res.send('﻿' + csv);
  }

  // ── Importaciones ───────────────────────────────────────────────────────────

  private static readonly CSV_FILTER = (_: any, file: { mimetype: string }, cb: any) => {
    const MIME_PERMITIDOS = ['text/csv', 'application/vnd.ms-excel', 'text/plain'];
    if (!MIME_PERMITIDOS.includes(file.mimetype)) {
      return cb(new BadRequestException('Solo se permiten archivos CSV'), false);
    }
    cb(null, true);
  };

  @Post('clientes')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file', {
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: ImportacionController.CSV_FILTER,
  }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Importar clientes desde archivo CSV (máx 5MB)' })
  importarClientes(@UploadedFile() file: { buffer: Buffer; originalname: string; mimetype: string }) {
    if (!file) throw new BadRequestException('No se recibió ningún archivo');
    return this.importacionService.importarClientes(file.buffer);
  }

  @Post('productos')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file', {
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: ImportacionController.CSV_FILTER,
  }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Importar productos desde archivo CSV (máx 5MB)' })
  importarProductos(@UploadedFile() file: { buffer: Buffer; originalname: string; mimetype: string }) {
    if (!file) throw new BadRequestException('No se recibió ningún archivo');
    return this.importacionService.importarProductos(file.buffer);
  }

  @Get('plantilla/proveedores')
  @ApiOperation({ summary: 'Descargar plantilla CSV para importar proveedores' })
  descargarPlantillaProveedores(@Res() res: Response) {
    const csv = this.importacionService.getPlantillaProveedores();
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="plantilla-proveedores.csv"');
    res.send('﻿' + csv);
  }

  @Post('proveedores')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Importar proveedores desde archivo CSV (máx 5MB)' })
  importarProveedores(@UploadedFile() file: { buffer: Buffer; originalname: string }) {
    if (!file) throw new Error('No se recibió ningún archivo');
    return this.importacionService.importarProveedores(file.buffer);
  }
}
