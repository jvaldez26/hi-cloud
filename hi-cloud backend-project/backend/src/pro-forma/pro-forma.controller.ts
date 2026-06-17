import {
  Controller, Get, Post, Delete, Body, Param,
  Query, ParseIntPipe, HttpCode, HttpStatus, UseGuards, Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, IsArray, ValidateNested, IsInt } from 'class-validator';
import { Type } from 'class-transformer';
import { ProFormaService } from './pro-forma.service';
import { PaginationDto } from '../common/dto/pagination.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { User } from '../users/users.entity';

class ItemDto {
  @IsOptional() @IsInt() productoId?: number;
  @IsString() descripcion!: string;
  @IsNumber() cantidad!: number;
  @IsNumber() precioUnitario!: number;
  @IsOptional() @IsNumber() porcentajeIva?: number;
}

class CreateProFormaDto {
  @IsOptional() @IsInt()    clienteId?: number;
  @IsOptional() @IsInt()    sucursalId?: number;
  @IsOptional() @IsInt()    vendedorId?: number;
  @IsOptional() @IsString() notas?: string;
  @IsOptional() @IsNumber() validezDias?: number;
  @IsOptional() @IsString() fecha?: string;
  @IsOptional() @IsString() nombreVendedor?: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => ItemDto) detalles!: ItemDto[];
}

@ApiTags('Pro Formas')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('pro-formas')
export class ProFormaController {
  constructor(private svc: ProFormaService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR)
  @ApiOperation({ summary: 'Crear Pro Forma (presupuesto informativo, sin NCF, sin stock)' })
  crear(@Body() dto: CreateProFormaDto, @GetUser() usuario: User) {
    return this.svc.crear(dto as any, usuario.id);
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR)
  @ApiOperation({ summary: 'Listar Pro Formas' })
  listar(@Query() pagination: PaginationDto) {
    return this.svc.listar(pagination);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR)
  @ApiOperation({ summary: 'Detalle de una Pro Forma' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.svc.findOne(id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Eliminar Pro Forma' })
  eliminar(@Param('id', ParseIntPipe) id: number) {
    return this.svc.eliminar(id);
  }

  @Get(':id/pdf')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR)
  @ApiOperation({ summary: 'Generar PDF de Pro Forma' })
  async pdf(@Param('id', ParseIntPipe) id: number, @Res() res: Response) {
    const { buffer, filename } = await this.svc.generarPDF(id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.length);
    res.end(buffer);
  }
}
