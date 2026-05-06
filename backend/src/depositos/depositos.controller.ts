import {
  Controller, Get, Post, Delete, Body, Param, Query,
  ParseIntPipe, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiHeader } from '@nestjs/swagger';
import {
  IsEnum, IsOptional, IsInt, IsPositive, IsNumber,
  Min, IsString, IsDateString,
} from 'class-validator';
import { Type } from 'class-transformer';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { User } from '../users/users.entity';
import { PaginationDto } from '../common/dto/pagination.dto';
import { DepositosService } from './depositos.service';
import { TipoDeposito } from './entities/deposito-bancario.entity';

class CreateDepositoDto {
  @IsInt() @IsPositive() @Type(() => Number)     cuentaId!: number;
  @IsDateString()                                 fecha!: string;
  @IsEnum(TipoDeposito)                           tipo!: TipoDeposito;
  @IsNumber() @Min(0.01) @Type(() => Number)      monto!: number;
  @IsOptional() @IsString()                       referencia?: string;
  @IsOptional() @IsString()                       descripcion?: string;
  @IsOptional() @IsInt() @Type(() => Number)      clienteId?: number;
  @IsOptional() @IsString()                       nombreDepositante?: string;
  @IsOptional() @IsInt() @Type(() => Number)      cxcId?: number;
  @IsOptional() @IsString()                       notas?: string;
}

@ApiTags('Depósitos Bancarios')
@ApiBearerAuth('access-token')
@ApiHeader({ name: 'X-Empresa-ID', required: true })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.CONTADOR)
@Controller('depositos')
export class DepositosController {
  constructor(private readonly svc: DepositosService) {}

  @Get('resumen')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VIEWER)
  resumen() { return this.svc.resumen(); }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VIEWER)
  @ApiOperation({ summary: 'Listar depósitos bancarios' })
  listar(
    @Query() pagination: PaginationDto,
    @Query('cuentaId') cuentaId?: string,
  ) {
    return this.svc.listar(pagination, cuentaId ? Number(cuentaId) : undefined);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VIEWER)
  findOne(@Param('id', ParseIntPipe) id: number) { return this.svc.findOne(id); }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Registrar depósito bancario (actualiza saldo de la cuenta)' })
  crear(@Body() dto: CreateDepositoDto, @GetUser() user: User) {
    return this.svc.crear(dto, user.id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar depósito (revierte el saldo)' })
  eliminar(@Param('id', ParseIntPipe) id: number) { return this.svc.eliminar(id); }
}
