import {Controller, Get, Post, Patch, Delete, Body, Param, Query,
  ParseIntPipe, UseGuards, HttpCode, HttpStatus, Res, Logger} from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiHeader } from '@nestjs/swagger';
import {
  IsString, IsOptional, IsInt, IsPositive, IsNumber, IsArray,
  ValidateNested, Min, IsEnum, IsDateString,
} from 'class-validator';
import { Type } from 'class-transformer';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { User } from '../users/users.entity';
import { PaginationDto } from '../common/dto/pagination.dto';
import { PreFacturaService } from './pre-factura.service';
import { PreFacturaPDFService } from './pre-factura-pdf.service';
import { EstadoPreFactura } from './entities/pre-factura.entity';

class DetalleDto {
  @IsOptional() @IsInt() @IsPositive() @Type(() => Number) productoId?: number;
  @IsString()                                               descripcion!: string;
  @IsOptional() @IsString()                                 unidadMedida?: string;
  @IsNumber() @Min(0.0001) @Type(() => Number)              cantidad!: number;
  @IsNumber() @Min(0) @Type(() => Number)                   precioUnitario!: number;
  @IsOptional() @IsNumber() @Min(0) @Type(() => Number)     porcentajeIva?: number;
}

class CreatePreFacturaDto {
  @IsInt() @IsPositive() @Type(() => Number)                clienteId!: number;
  @IsDateString()                                            fecha!: string;
  @IsOptional() @IsDateString()                              fechaVencimiento?: string;
  @IsOptional() @IsString()                                  tipoNcf?: string;
  @IsOptional() @IsString()                                  notas?: string;
  @IsOptional() @IsInt() @Type(() => Number)                 sucursalId?: number;
  @IsOptional() @IsInt() @IsPositive() @Type(() => Number)   vendedorId?: number;
  @IsOptional() @IsString()                                  nombreVendedor?: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => DetalleDto)
  detalles!: DetalleDto[];
}

class RechazarDto {
  @IsString() motivo!: string;
}

class ConvertirDto {
  @IsOptional() @IsString() tipoNcf?: string;
}

@ApiTags('Pre-Facturas')
@ApiBearerAuth('access-token')
@ApiHeader({ name: 'X-Empresa-ID', description: 'ID de la empresa activa', required: true })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR)
@Controller('pre-facturas')
export class PreFacturaController {
  constructor(
    private readonly svc: PreFacturaService,
    private readonly pdfSvc: PreFacturaPDFService,
  ) {}
  private readonly logger = new Logger(PreFacturaController.name);

  @Get('resumen')
  @ApiOperation({ summary: 'Conteo y monto por estado de pre-facturas' })
  resumen() { return this.svc.resumen(); }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR, UserRole.VIEWER)
  @ApiOperation({ summary: 'Listar pre-facturas con paginación y filtro por estado' })
  listar(
    @Query() pagination: PaginationDto,
    @Query('estado') estado?: EstadoPreFactura,
  ) {
    return this.svc.listar(pagination, estado);
  }

  @Get(':id/pdf')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR, UserRole.VIEWER)
  async pdf(@Param('id', ParseIntPipe) id: number, @Res() res: Response) {
    try {
      const { buffer, filename } = await this.pdfSvc.generarPDF(id);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Length', buffer.length);
      res.end(buffer);
    } catch (e: any) {
      this.logger.error(`[PDF] ${e?.message ?? e}`);
      res.status(500).json({ message: e?.message ?? 'Error generando PDF' });
    }
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR, UserRole.VIEWER)
  @ApiOperation({ summary: 'Detalle completo de una pre-factura' })
  findOne(@Param('id', ParseIntPipe) id: number) { return this.svc.findOne(id); }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Crear nueva pre-factura en borrador' })
  crear(@Body() dto: CreatePreFacturaDto, @GetUser() user: User) {
    return this.svc.crear(dto, user.id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Editar pre-factura (solo en BORRADOR)' })
  actualizar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: Partial<CreatePreFacturaDto>,
  ) {
    return this.svc.actualizar(id, dto);
  }

  @Patch(':id/enviar')
  @ApiOperation({ summary: 'Enviar pre-factura al cliente' })
  enviar(@Param('id', ParseIntPipe) id: number) { return this.svc.enviar(id); }

  @Patch(':id/aprobar')
  @ApiOperation({ summary: 'Aprobar pre-factura' })
  aprobar(@Param('id', ParseIntPipe) id: number) { return this.svc.aprobar(id); }

  @Patch(':id/rechazar')
  @ApiOperation({ summary: 'Rechazar pre-factura con motivo' })
  rechazar(@Param('id', ParseIntPipe) id: number, @Body() dto: RechazarDto) {
    return this.svc.rechazar(id, dto.motivo);
  }

  @Patch(':id/convertir')
  @ApiOperation({ summary: 'Convertir pre-factura aprobada en factura oficial' })
  convertir(
    @Param('id', ParseIntPipe) id: number,
    @GetUser() user: User,
    @Body() dto: ConvertirDto,
  ) {
    return this.svc.convertirAFactura(id, user.id, dto.tipoNcf);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar pre-factura (no convertidas)' })
  eliminar(@Param('id', ParseIntPipe) id: number) { return this.svc.eliminar(id); }
}
