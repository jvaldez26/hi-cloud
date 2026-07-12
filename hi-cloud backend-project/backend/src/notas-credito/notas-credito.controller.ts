import {Controller, Get, Post, Patch, Delete, Body, Param, Query,
  ParseIntPipe, UseGuards, HttpCode, HttpStatus, Res, Logger} from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiHeader } from '@nestjs/swagger';
import {
  IsString, IsOptional, IsInt, IsPositive, IsNumber, IsArray,
  ValidateNested, Min, IsDateString, IsEnum,
} from 'class-validator';
import { Type } from 'class-transformer';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { User } from '../users/users.entity';
import { PaginationDto } from '../common/dto/pagination.dto';
import { NotasCreditoService } from './notas-credito.service';
import { NotaCreditoPDFService } from './nc-pdf.service';
import { MotivoNotaCredito } from './entities/nota-credito.entity';

class DetalleDto {
  @IsOptional() @IsInt() @IsPositive() @Type(() => Number) productoId?: number;
  @IsString()                                               descripcion!: string;
  @IsOptional() @IsString()                                 unidadMedida?: string;
  @IsNumber() @Min(0.0001) @Type(() => Number)              cantidad!: number;
  @IsNumber() @Min(0) @Type(() => Number)                   precioUnitario!: number;
  @IsOptional() @IsNumber() @Min(0) @Type(() => Number)     porcentajeIva?: number;
}

class CreateNCDto {
  @IsInt() @IsPositive() @Type(() => Number)                clienteId!: number;
  @IsDateString()                                            fecha!: string;
  @IsOptional() @IsString()                                  tipoNcf?: string;
  @IsOptional() @IsInt() @Type(() => Number)                 facturaOriginalId?: number;
  @IsOptional() @IsString()                                  facturaOriginalFolio?: string;
  @IsOptional() @IsEnum(MotivoNotaCredito)                   motivo?: MotivoNotaCredito;
  @IsOptional() @IsString()                                  descripcionMotivo?: string;
  @IsOptional() @IsString()                                  notas?: string;
  @IsOptional() @IsInt() @Type(() => Number)                 vendedorId?: number;
  @IsOptional() @IsString()                                  nombreVendedor?: string;
  @IsOptional() @IsString()                                  moneda?: string;
  @IsOptional() @IsNumber() @Type(() => Number)              tipoCambio?: number;
  @IsArray() @ValidateNested({ each: true }) @Type(() => DetalleDto)
  detalles!: DetalleDto[];
}

@ApiTags('Notas de Crédito (E34)')
@ApiBearerAuth('access-token')
@ApiHeader({ name: 'X-Empresa-ID', required: true })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR)
@Controller('notas-credito')
export class NotasCreditoController {
  constructor(
    private readonly svc:    NotasCreditoService,
    private readonly pdfSvc: NotaCreditoPDFService,
  ) {}
  private readonly logger = new Logger(NotasCreditoController.name);

  @Get('resumen')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR, UserRole.VIEWER)
  resumen() { return this.svc.resumen(); }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR, UserRole.VIEWER)
  @ApiOperation({ summary: 'Listar notas de crédito con paginación' })
  listar(@Query() pagination: PaginationDto) { return this.svc.listar(pagination); }

  @Get('por-factura/:facturaId')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR, UserRole.VIEWER)
  @ApiOperation({ summary: 'Notas de crédito asociadas a una factura específica' })
  porFactura(@Param('facturaId', ParseIntPipe) facturaId: number) {
    return this.svc.porFactura(facturaId);
  }

  @Get('por-factura/:facturaId/saldo-disponible')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR, UserRole.VIEWER)
  @ApiOperation({ summary: 'Saldo disponible para NC sobre una factura (total - NC activas)' })
  saldoDisponible(@Param('facturaId', ParseIntPipe) facturaId: number) {
    return this.svc.getSaldoDisponible(facturaId);
  }

  @Get(':id/pdf')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR, UserRole.VIEWER)
  @ApiOperation({ summary: 'Generar PDF de nota de crédito E34' })
  async pdf(@Param('id', ParseIntPipe) id: number, @Res() res: Response) {
    try {
      const { buffer, filename } = await this.pdfSvc.generarPDF(id);
      res.setHeader('Content-Type',        'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Length',       buffer.length);
      res.end(buffer);
    } catch (e: any) {
      this.logger.error(`[NC-PDF] ${e?.message ?? e}`);
      res.status(500).json({ message: e?.message ?? 'Error generando PDF' });
    }
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR, UserRole.VIEWER)
  findOne(@Param('id', ParseIntPipe) id: number) { return this.svc.findOne(id); }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Crear nota de crédito (e-CF E34 DGII)' })
  crear(@Body() dto: CreateNCDto, @GetUser() user: User) {
    return this.svc.crear(dto, user.id);
  }

  @Patch(':id/emitir')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR)
  @ApiOperation({ summary: 'Emitir nota de crédito (e-CF E34)' })
  emitir(@Param('id', ParseIntPipe) id: number) { return this.svc.emitir(id); }

  @Patch(':id/anular')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Anular nota de crédito' })
  anular(@Param('id', ParseIntPipe) id: number) { return this.svc.anular(id); }

  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Eliminar nota en BORRADOR' })
  eliminar(@Param('id', ParseIntPipe) id: number) { return this.svc.eliminar(id); }
}
