import {
  Controller, Get, Post, Delete, Body, Param, Query,
  ParseIntPipe, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiHeader } from '@nestjs/swagger';
import {
  IsNumber, IsPositive, IsString, IsOptional, Min,
  IsEnum, IsInt,
} from 'class-validator';
import { Type } from 'class-transformer';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { User } from '../users/users.entity';
import { PaginationDto } from '../common/dto/pagination.dto';
import { AnticiposClienteService, CreateAnticipoDto, AplicarAnticipoDto } from './anticipos-cliente.service';
import { EstadoAnticipo } from './entities/anticipo-cliente.entity';

class CreateAnticipoBodyDto implements CreateAnticipoDto {
  @IsOptional() @IsInt() @IsPositive() @Type(() => Number) clienteId?: number;
  @IsOptional() @IsString()                                clienteNombre?: string;
  @IsNumber()   @Min(0.01) @Type(() => Number)             monto!: number;
  @IsString()                                              tipoPago!: string;
  @IsOptional() @IsString()                                referencia?: string;
  @IsOptional() @IsString()                                descripcion?: string;
  @IsOptional() @IsString()                                concepto?: string;
  @IsOptional() @IsString()                                metodoPago?: string;
  @IsOptional() @IsString()                                fecha?: string;
  @IsOptional() @IsInt() @IsPositive() @Type(() => Number) vendedorId?: number;
  @IsOptional() @IsString()                                nombreUsuario?: string;
}

class AplicarAnticipoBodyDto implements AplicarAnticipoDto {
  @IsInt() @IsPositive() @Type(() => Number) cxcId!: number;
  @IsOptional() @IsNumber() @Min(0.01) @Type(() => Number) monto?: number;
}

class AnticiposQueryDto extends PaginationDto {
  @IsOptional() @IsInt() @IsPositive() @Type(() => Number) clienteId?: number;
  @IsOptional() @IsEnum(EstadoAnticipo)                    estado?: EstadoAnticipo;
}

@ApiTags('Anticipos de Clientes')
@ApiBearerAuth('access-token')
@ApiHeader({ name: 'X-Empresa-ID', required: true })
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('anticipos')
export class AnticiposClienteController {
  constructor(private readonly svc: AnticiposClienteService) {}

  @Get('resumen')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VIEWER)
  @ApiOperation({ summary: 'Resumen de anticipos: hoy, activos, total' })
  resumen() { return this.svc.resumen(); }

  @Get('cliente/:clienteId')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR, UserRole.VIEWER)
  @ApiOperation({ summary: 'Anticipos activos de un cliente (para aplicar al facturar)' })
  getActivosPorCliente(@Param('clienteId', ParseIntPipe) clienteId: number) {
    return this.svc.getActivosPorCliente(clienteId);
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VIEWER)
  @ApiOperation({ summary: 'Listar anticipos con filtros opcionales' })
  listar(@Query() query: AnticiposQueryDto) {
    return this.svc.listar(query, query.clienteId, query.estado);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR)
  @ApiOperation({ summary: 'Registrar anticipo de cliente' })
  crear(@Body() dto: CreateAnticipoBodyDto, @GetUser() user: User) {
    return this.svc.crear(
      { ...dto, nombreUsuario: user.nombre },
      user.id,
    );
  }

  @Post(':id/aplicar')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Aplicar anticipo a una CxC (parcial o total)' })
  aplicar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AplicarAnticipoBodyDto,
    @GetUser() user: User,
  ) {
    return this.svc.aplicar(id, dto, user.id);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Anular anticipo' })
  anular(@Param('id', ParseIntPipe) id: number) {
    return this.svc.anular(id);
  }
}
