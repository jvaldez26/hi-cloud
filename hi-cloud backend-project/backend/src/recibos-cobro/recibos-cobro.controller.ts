import {Controller, Get, Post, Delete, Body, Param, Query,
  ParseIntPipe, UseGuards, HttpCode, HttpStatus, Res, Logger} from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiHeader } from '@nestjs/swagger';
import {
  IsEnum, IsInt, IsPositive, IsNumber, IsOptional,
  IsString, IsDateString, Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { User } from '../users/users.entity';
import { PaginationDto } from '../common/dto/pagination.dto';
import { RecibosCobrosService } from './recibos-cobro.service';
import { ReciboPDFService } from './recibo-pdf.service';
import { MetodoPagoRecibo } from './entities/recibo-cobro.entity';

class CreateReciboDto {
  @IsOptional() @IsInt() @IsPositive() @Type(() => Number)  clienteId?: number;
  @IsOptional() @IsString()                                  clienteNombre?: string;
  @IsOptional() @IsDateString()                              fecha?: string;
  @IsNumber() @Min(0.01) @Type(() => Number)                 monto!: number;
  @IsEnum(MetodoPagoRecibo)                                  metodoPago!: MetodoPagoRecibo;
  @IsString()                                                concepto!: string;
  @IsOptional() @IsInt() @Type(() => Number)                 facturaId?: number;
  @IsOptional() @IsString()                                  facturaFolio?: string;
  @IsOptional() @IsInt() @Type(() => Number)                 cxcId?: number;
  @IsOptional() @IsString()                                  referencia?: string;
  @IsOptional() @IsString()                                  notas?: string;
}

@ApiTags('Recibos de Cobro')
@ApiBearerAuth('access-token')
@ApiHeader({ name: 'X-Empresa-ID', required: true })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.CONTADOR)
@Controller('recibos-cobro')
export class RecibosCobrosController {
  constructor(
    private readonly svc: RecibosCobrosService,
    private readonly pdfSvc: ReciboPDFService,
  ) {}
  private readonly logger = new Logger(RecibosCobrosController.name);

  @Get('resumen')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VIEWER)
  resumen() { return this.svc.resumen(); }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VIEWER)
  listar(
    @Query() pagination: PaginationDto,
    @Query('clienteId') clienteId?: string,
  ) {
    return this.svc.listar(pagination, clienteId ? Number(clienteId) : undefined);
  }

  @Get(':id/pdf')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VIEWER)
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
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VIEWER)
  findOne(@Param('id', ParseIntPipe) id: number) { return this.svc.findOne(id); }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR)
  @ApiOperation({ summary: 'Emitir recibo de cobro' })
  crear(@Body() dto: CreateReciboDto, @GetUser() user: User) {
    const hoy = new Date().toISOString().split('T')[0];
    return this.svc.crear({ ...dto, fecha: dto.fecha ?? hoy, nombreUsuario: user.nombre }, user.id);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  eliminar(@Param('id', ParseIntPipe) id: number) { return this.svc.eliminar(id); }
}
