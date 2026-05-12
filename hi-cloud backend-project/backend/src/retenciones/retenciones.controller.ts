import {Controller, Get, Post, Delete, Body, Param,
  Query, ParseIntPipe, HttpCode, HttpStatus, UseGuards, Res, Logger} from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { IsString, IsEnum, IsNumber, IsPositive, IsOptional, IsInt } from 'class-validator';
import { RetencionesService } from './retenciones.service';
import { RetencionPDFService } from './retencion-pdf.service';
import { TipoServicioRetencion } from './entities/retencion-isr.entity';
import { PaginationDto } from '../common/dto/pagination.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { User } from '../users/users.entity';

class CreateRetencionDto {
  @IsString() periodo: string;
  @IsString() nombreProveedor: string;
  @IsOptional() @IsString() rncProveedor?: string;
  @IsEnum(TipoServicioRetencion) tipoServicio: TipoServicioRetencion;
  @IsString() descripcionServicio: string;
  @IsNumber({ maxDecimalPlaces: 2 }) @IsPositive() montoBruto: number;
  @IsOptional() @IsInt() compraId?: number;
}

@ApiTags('Retenciones ISR')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.CONTADOR)
@Controller('retenciones')
export class RetencionesController {
  constructor(
    private svc: RetencionesService,
    private readonly pdfSvc: RetencionPDFService,
  ) {}
  private readonly logger = new Logger(RetencionesController.name);

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Registrar retención ISR (Código Tributario RD)' })
  crear(@Body() dto: CreateRetencionDto, @GetUser() usuario: User) {
    return this.svc.crear(dto, usuario.id);
  }

  @Get()
  @ApiOperation({ summary: 'Listar retenciones con paginación' })
  listar(@Query() pagination: PaginationDto) {
    return this.svc.listar(pagination);
  }

  @Get('reporte/ir17')
  @ApiOperation({ summary: 'Reporte IR-17 — Declaración mensual de retenciones DGII' })
  @ApiQuery({ name: 'mes',  required: true, example: 5 })
  @ApiQuery({ name: 'anio', required: true, example: 2026 })
  getReporteIR17(
    @Query('mes')  mes:  number,
    @Query('anio') anio: number,
  ) {
    return this.svc.getReporteIR17(Number(mes), Number(anio));
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

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar retención' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.svc.remove(id);
  }
}
