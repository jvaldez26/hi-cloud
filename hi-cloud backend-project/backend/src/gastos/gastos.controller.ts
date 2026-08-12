import {Controller, Get, Post, Delete, Body, Param, Query,
  ParseIntPipe, HttpCode, HttpStatus, UseGuards, Res, Logger} from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import {
  IsEnum, IsString, IsNotEmpty, IsNumber, IsPositive,
  IsOptional, IsDateString, Min, IsInt,
} from 'class-validator';
import { Type } from 'class-transformer';
import { GastosService } from './gastos.service';
import { GastoPDFService } from './gasto-pdf.service';
import { CategoriaGasto } from './entities/gasto.entity';
import { PaginationDto } from '../common/dto/pagination.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { User } from '../users/users.entity';

/** Filtros comunes al listado y a la exportación. */
class FiltrosGastosDto {
  @IsOptional() @IsString()                  search?:    string;
  @IsOptional() @IsInt() @Type(() => Number) mes?:       number;
  @IsOptional() @IsInt() @Type(() => Number) anio?:      number;
  @IsOptional() @IsEnum(CategoriaGasto)      categoria?: CategoriaGasto;
}

class ListGastosDto extends FiltrosGastosDto {
  @IsOptional() @IsInt() @Type(() => Number) page?:  number;
  @IsOptional() @IsInt() @Type(() => Number) limit?: number;
}

/**
 * DTO para el endpoint de exportación.
 *
 * No hereda page ni limit — es un endpoint sin paginación por diseño.
 * Tampoco tiene flag boolean: el problema anterior era exactamente ese.
 * El ValidationPipe global corre con enableImplicitConversion, que convierte
 * "true" → true ANTES de que @Transform evalúe `value === 'true'`, comparando
 * un boolean contra un string y devolviendo siempre false. El endpoint propio
 * no puede caer en ese problema y no afecta al listado normal.
 */
class ExportarGastosDto extends FiltrosGastosDto {}

class CreateGastoDto {
  @IsDateString()                                  fecha: string;
  @IsEnum(CategoriaGasto)                          categoria: CategoriaGasto;
  @IsString() @IsNotEmpty()                        descripcion: string;
  @IsNumber({ maxDecimalPlaces: 2 }) @IsPositive() monto: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) itbis?: number;
  @IsOptional() @IsString()                        proveedor?: string;
  @IsOptional() @IsString()                        comprobante?: string;
  @IsOptional() @IsString()                        rncProveedor?: string;
  /** Código DGII 606 — 01 Personal · 02 Suministros · 03 Arrendamientos · 11 Seguros … */
  @IsOptional() @IsString()                        tipoBienes?: string;
  /** Forma de pago DGII 606 — 01 Efectivo · 02 Cheque/Transferencia · 03 Tarjeta … */
  @IsOptional() @IsString()                        formaPago?: string;
}

@ApiTags('Gastos Operativos')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR)
@Controller('gastos')
export class GastosController {
  constructor(
    private svc: GastosService,
    private readonly pdfSvc: GastoPDFService,
  ) {}
  private readonly logger = new Logger(GastosController.name);

  @Get('categorias')
  @ApiOperation({ summary: 'Listar categorías de gastos con cuenta contable' })
  getCategorias() {
    return this.svc.getCategorias();
  }

  @Get('resumen')
  @ApiOperation({ summary: 'Resumen de gastos por categoría en un mes' })
  getResumen(
    @Query('mes')  mes:  number,
    @Query('anio') anio: number,
  ) {
    return this.svc.getResumenMes(Number(mes), Number(anio));
  }

  @Get('anual')
  @ApiOperation({ summary: 'Gastos mensuales del año (para gráfica)' })
  getAnual(@Query('anio') anio: number) {
    return this.svc.getResumenAnual(Number(anio));
  }

  // Declarado ANTES de @Get(':id') para que Nest no lo trate como id="exportar"
  @Get('exportar')
  @ApiOperation({
    summary: 'Todos los gastos del filtro, sin paginación (para Excel)',
    description:
      'Mismos filtros que el listado (mes, anio, categoria, search) pero sin ' +
      'page ni limit: devuelve el conjunto completo como un array.',
  })
  exportar(@Query() q: ExportarGastosDto) {
    return this.svc.exportarTodos(q.mes, q.anio, q.categoria, q.search);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Registrar gasto (genera asiento contable automático)' })
  crear(@Body() dto: CreateGastoDto, @GetUser() usuario: User) {
    return this.svc.crear({ ...dto, userId: usuario.id });
  }

  @Get()
  @ApiOperation({ summary: 'Listar gastos con filtros por mes, año y categoría' })
  listar(@Query() q: ListGastosDto) {
    return this.svc.listar(
      { page: q.page, limit: q.limit, search: q.search },
      q.mes,
      q.anio,
      q.categoria,
    );
  }

  @Get(':id/pdf')
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
  @ApiOperation({ summary: 'Detalle de un gasto' })
  findById(@Param('id', ParseIntPipe) id: number) {
    return this.svc.findById(id);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Eliminar gasto (solo ADMIN)' })
  eliminar(@Param('id', ParseIntPipe) id: number) {
    return this.svc.eliminar(id);
  }
}
