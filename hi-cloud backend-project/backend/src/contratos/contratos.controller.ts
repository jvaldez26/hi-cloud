import {
  Controller, Get, Post, Patch, Body, Param, Query,
  ParseIntPipe, HttpCode, HttpStatus, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import {
  IsInt, IsPositive, IsString, IsNotEmpty, IsEnum,
  IsOptional, IsNumber, IsBoolean, IsDateString, Min, Max,
} from 'class-validator';
import { ContratosService } from './contratos.service';
import { EstadoContrato, PeriodoFacturacion } from './entities/contrato.entity';
import { PaginationDto } from '../common/dto/pagination.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { User } from '../users/users.entity';
import { IsEnum as IsEnumClass } from 'class-validator';

class CreateContratoDto {
  @IsInt() @IsPositive()                             clienteId: number;
  @IsString() @IsNotEmpty()                          nombre: string;
  @IsString() @IsNotEmpty()                          descripcionServicio: string;
  @IsDateString()                                    fechaInicio: string;
  @IsOptional() @IsDateString()                      fechaFin?: string;
  @IsEnum(PeriodoFacturacion)                        periodoFacturacion: PeriodoFacturacion;
  @IsNumber({ maxDecimalPlaces: 2 }) @IsPositive()   montoBase: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(100) porcentajeIva?: number;
  @IsOptional() @IsInt() @Min(1) @Max(28)            diaFacturacion?: number;
  @IsOptional() @IsBoolean()                         facturaAutomatica?: boolean;
  @IsOptional() @IsString()                          terminos?: string;
}

class CambiarEstadoDto {
  @IsEnum(EstadoContrato) estado: EstadoContrato;
}

@ApiTags('Contratos de Servicio')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR)
@Controller('contratos')
export class ContratosController {
  constructor(private svc: ContratosService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Crear contrato de servicio recurrente' })
  crear(@Body() dto: CreateContratoDto, @GetUser() usuario: User) {
    return this.svc.crear({ ...dto, userId: usuario.id });
  }

  @Get()
  @ApiOperation({ summary: 'Listar contratos con filtros' })
  listar(
    @Query() pagination: PaginationDto,
    @Query('estado') estado?: EstadoContrato,
  ) {
    return this.svc.listar(pagination, estado);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de un contrato' })
  findById(@Param('id', ParseIntPipe) id: number) {
    return this.svc.findById(id);
  }

  @Patch(':id/estado')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Cambiar estado del contrato' })
  cambiarEstado(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CambiarEstadoDto,
  ) {
    return this.svc.cambiarEstado(id, dto.estado);
  }

  @Post(':id/facturar')
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Generar factura manual de este contrato ahora' })
  facturar(@Param('id', ParseIntPipe) id: number) {
    return this.svc.generarFactura(id);
  }
}
