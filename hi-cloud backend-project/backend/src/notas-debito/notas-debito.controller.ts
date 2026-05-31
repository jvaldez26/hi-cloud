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
import { NotasDebitoService } from './notas-debito.service';
import { NotaDebitoPDFService } from './nota-pdf.service';
import { MotivoNotaDebito } from './entities/nota-debito.entity';

class DetalleNDDto {
  @IsOptional() @IsInt() @IsPositive() @Type(() => Number) productoId?: number;
  @IsString()                                               descripcion!: string;
  @IsOptional() @IsString()                                 unidadMedida?: string;
  @IsNumber() @Min(0.0001) @Type(() => Number)              cantidad!: number;
  @IsNumber() @Min(0) @Type(() => Number)                   precioUnitario!: number;
  @IsOptional() @IsNumber() @Min(0) @Type(() => Number)     porcentajeIva?: number;
}

class CreateNDDto {
  @IsInt() @IsPositive() @Type(() => Number)                clienteId!: number;
  @IsDateString()                                            fecha!: string;
  @IsOptional() @IsInt() @Type(() => Number)                 facturaOriginalId?: number;
  @IsOptional() @IsString()                                  facturaOriginalFolio?: string;
  @IsEnum(MotivoNotaDebito)                                  motivo!: MotivoNotaDebito;
  @IsOptional() @IsString()                                  descripcionMotivo?: string;
  @IsOptional() @IsString()                                  notas?: string;
  @IsOptional() @IsInt() @Type(() => Number)                 vendedorId?: number;
  @IsOptional() @IsString()                                  nombreVendedor?: string;
  @IsOptional() @IsString()                                  moneda?: string;
  @IsOptional() @IsNumber() @Type(() => Number)              tipoCambio?: number;
  @IsArray() @ValidateNested({ each: true }) @Type(() => DetalleNDDto)
  detalles!: DetalleNDDto[];
}

@ApiTags('Notas de Débito (E33)')
@ApiBearerAuth('access-token')
@ApiHeader({ name: 'X-Empresa-ID', required: true })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.CONTADOR)
@Controller('notas-debito')
export class NotasDebitoController {
  constructor(
    private readonly svc:    NotasDebitoService,
    private readonly pdfSvc: NotaDebitoPDFService,
  ) {}
  private readonly logger = new Logger(NotasDebitoController.name);

  @Get('resumen')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VIEWER)
  resumen() { return this.svc.resumen(); }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VIEWER)
  @ApiOperation({ summary: 'Listar notas de débito con paginación' })
  listar(@Query() pagination: PaginationDto) { return this.svc.listar(pagination); }

  @Get('factura/:facturaId/balance')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VIEWER)
  @ApiOperation({ summary: 'Balance de ND sobre una factura (total original + ND activas)' })
  balance(@Param('facturaId', ParseIntPipe) facturaId: number) {
    return this.svc.getBalance(facturaId);
  }

  @Get(':id/pdf')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VIEWER)
  @ApiOperation({ summary: 'Generar PDF de nota de débito E33' })
  async pdf(@Param('id', ParseIntPipe) id: number, @Res() res: Response) {
    try {
      const { buffer, filename } = await this.pdfSvc.generarPDF(id);
      res.setHeader('Content-Type',        'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Length',       buffer.length);
      res.end(buffer);
    } catch (e: any) {
      this.logger.error(`[ND-PDF] ${e?.message ?? e}`);
      res.status(500).json({ message: e?.message ?? 'Error generando PDF' });
    }
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VIEWER)
  findOne(@Param('id', ParseIntPipe) id: number) { return this.svc.findOne(id); }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Crear nota de débito (e-CF E33 DGII)' })
  crear(@Body() dto: CreateNDDto, @GetUser() user: User) {
    return this.svc.crear(dto, user.id);
  }

  @Patch(':id/emitir')
  @ApiOperation({ summary: 'Emitir nota de débito' })
  emitir(@Param('id', ParseIntPipe) id: number) { return this.svc.emitir(id); }

  @Patch(':id/anular')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Anular nota de débito' })
  anular(@Param('id', ParseIntPipe) id: number) { return this.svc.anular(id); }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar nota en BORRADOR' })
  eliminar(@Param('id', ParseIntPipe) id: number) { return this.svc.eliminar(id); }
}
