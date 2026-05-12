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
import { IsEnum, IsOptional, IsString, IsInt } from 'class-validator';
import { Type } from 'class-transformer';
import { ComprasService }    from './compras.service';
import { ComprasPdfService } from './compras-pdf.service';
import { CreateCompraDto }   from './dto/create-compra.dto';
import { CompraEstado }      from './entities/compra.entity';
import { PaginationDto } from '../common/dto/pagination.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { User } from '../users/users.entity';

class ComprasFilterDto extends PaginationDto {
  @IsOptional() @IsString()  estado?: string;
  @IsOptional() @IsString()  desde?: string;
  @IsOptional() @IsString()  hasta?: string;
  @IsOptional() @IsInt() @Type(() => Number) proveedorId?: number;
}

class CambiarEstadoDto {
  @IsEnum(CompraEstado)
  estado: CompraEstado;
}

@ApiTags('Compras')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('compras')
export class ComprasController {
  constructor(
    private comprasService:    ComprasService,
    private comprasPdfService: ComprasPdfService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Crear orden de compra (calcula ITBIS 18% automáticamente)' })
  create(@Body() dto: CreateCompraDto, @GetUser() usuario: User) {
    return this.comprasService.create(dto, usuario);
  }

  @Get()
  @ApiOperation({ summary: 'Listar compras con paginación y filtros' })
  findAll(@Query() pagination: ComprasFilterDto) {
    return this.comprasService.findAll(pagination);
  }

  @Get('resumen')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Resumen de compras por estado con totales de ITBIS' })
  resumen() {
    return this.comprasService.resumenPorEstado();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener compra por ID con detalles' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.comprasService.findOne(id);
  }

  @Patch(':id/estado')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({
    summary:
      'Cambiar estado — RECIBIDA aumenta stock, CANCELADA desde RECIBIDA lo revierte',
  })
  cambiarEstado(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CambiarEstadoDto,
  ) {
    return this.comprasService.cambiarEstado(id, dto.estado);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Eliminar compra (solo borradores)' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.comprasService.remove(id);
  }

  @Get(':id/pdf')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR)
  @ApiOperation({ summary: 'Descargar Orden de Compra en PDF' })
  async descargarPdf(
    @Param('id', ParseIntPipe) id: number,
    @Res() res: Response,
  ) {
    const { buffer, filename } = await this.comprasPdfService.generarOrdenCompraPDF(id);
    res.set({
      'Content-Type':        'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
    });
    res.send(buffer);
  }
}
