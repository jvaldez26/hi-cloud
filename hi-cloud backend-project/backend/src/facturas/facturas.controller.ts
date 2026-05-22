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
import { IsEnum, IsOptional, IsString, IsInt, IsBoolean, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class FacturasFilterDto extends PaginationDto {
  @IsOptional() @IsString()
  estado?: string;

  @IsOptional() @IsString()
  desde?: string;

  @IsOptional() @IsString()
  hasta?: string;

  @IsOptional() @IsInt() @Type(() => Number)
  clienteId?: number;

  @IsOptional() @IsString()
  tipoPago?: string;       // CONTADO | CREDITO

  @IsOptional() @IsString()
  tipoNcf?: string;        // E31 | E32 | E41 ...

  @IsOptional() @Type(() => Number)
  montoMin?: number;

  @IsOptional() @Type(() => Number)
  montoMax?: number;
}

class CambiarEstadoDto {
  @IsEnum(FacturaEstado)
  estado: FacturaEstado;
}

class DatosCompradorPosDto {
  @IsOptional() @IsString()
  rnc?: string;

  @IsOptional() @IsString()
  cedula?: string;

  @IsOptional() @IsString()
  razonSocial?: string;

  @IsOptional() @IsString()
  direccion?: string;

  @IsOptional() @IsString()
  numeroOrdenCompra?: string;
}

class EmitirDesdePos {
  @IsEnum(FacturaEstado)
  estado: FacturaEstado;

  @IsOptional() @IsInt() @Type(() => Number)
  tipoEcf?: number;

  @IsOptional() @ValidateNested() @Type(() => DatosCompradorPosDto)
  datosComprador?: DatosCompradorPosDto;

  /**
   * Si true → crear el e-CF directamente en CONTINGENCIA (sin llamar a MSeller).
   * Se usa cuando el usuario activó "Modo contingencia" en Configuración → POS.
   * El cron de rescate lo reintentará cada 30 minutos.
   */
  @IsOptional() @IsBoolean()
  modoContingencia?: boolean;
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
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR, UserRole.VIEWER)
  @ApiOperation({ summary: 'Listar facturas con paginación y filtros' })
  findAll(@Query() pagination: FacturasFilterDto) {
    return this.facturasService.findAll(pagination);
  }

  @Get('resumen')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Resumen de facturas por estado' })
  resumen() {
    return this.facturasService.resumenPorEstado();
  }

  @Get('buscar-para-nota')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR, UserRole.VIEWER)
  @ApiOperation({
    summary: 'Buscar facturas con e-CF ACEPTADO para usar como referencia en E33 o E34',
    description: 'Devuelve facturas cuyo e-CF está ACEPTADO por DGII. Búsqueda por folio o eNCF.',
  })
  buscarParaNota(@Query('q') q: string) {
    return this.facturasService.buscarParaNota(q ?? '');
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR, UserRole.VIEWER)
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
    return this.facturasService.cambiarEstado(id, dto.estado, false);
  }

  /**
   * Emite la factura desde el POS — usa modo síncrono (8s timeout).
   * Si MSeller no responde, la venta se completa igual con e-CF en PENDIENTE_ENVIO.
   */
  @Patch(':id/emitir-pos')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN, UserRole.VENDEDOR)
  @ApiOperation({
    summary: 'Emitir factura desde POS (síncrono 8s — venta no se bloquea si MSeller falla)',
  })
  emitirDesdePos(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: EmitirDesdePos,
  ) {
    return this.facturasService.cambiarEstado(
      id,
      dto.estado,
      true,
      dto.tipoEcf,
      dto.datosComprador,
      dto.modoContingencia,
    );
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Eliminar factura (solo borradores)' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.facturasService.remove(id);
  }

  /**
   * Reemite e-CF para todas las facturas emitidas/pagadas que no tienen
   * comprobante asociado. Útil para recuperar facturas creadas antes de
   * configurar MSeller, o cuando el e-CF falló silenciosamente.
   */
  @Post('recuperar-ecf')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: 'Recuperar e-CF de facturas sin comprobante — lote (solo ADMIN)',
    description:
      'Busca facturas emitidas/pagadas sin e-CF y los emite. ' +
      'Respeta un delay de 600ms entre envíos para no saturar MSeller.',
  })
  recuperarEcf(@GetUser() usuario: User) {
    return this.facturasService.recuperarEcfFacturasSinComprobante(usuario);
  }

  /**
   * Emite e-CF para una factura individual que ya está EMITIDA o PAGADA
   * pero no tiene comprobante. No cambia el estado de la factura.
   */
  @Post(':id/emitir-ecf')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({
    summary: 'Emitir e-CF para una factura EMITIDA/PAGADA sin comprobante',
  })
  emitirEcfIndividual(
    @Param('id', ParseIntPipe) id: number,
    @GetUser() usuario: User,
  ) {
    return this.facturasService.emitirEcfIndividual(id, usuario);
  }

  // ── PDF ────────────────────────────────────────────────────────────

  @Get(':id/pdf')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR)
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
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR)
  @ApiOperation({ summary: 'Vista previa HTML de la factura en navegador' })
  async previewHTML(
    @Param('id', ParseIntPipe) id: number,
    @Res() res: Response,
  ) {
    const html = await this.pdfService.generarFacturaHTML(id);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(html);
  }

  @Post(':id/duplicar')
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR)
  @ApiOperation({ summary: 'Duplicar factura — crea nueva en borrador con mismo cliente e ítems' })
  duplicar(
    @Param('id', ParseIntPipe) id: number,
    @GetUser() usuario: User,
  ) {
    return this.facturasService.duplicar(id, usuario.id);
  }

  @Get(':id/recibo-pdf')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR)
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
