import {
  Controller, Get, Post, Delete, Body, Param, Query,
  ParseIntPipe, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
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
import { MetodoPagoRecibo } from './entities/recibo-cobro.entity';

class CreateReciboDto {
  @IsInt() @IsPositive() @Type(() => Number)     clienteId!: number;
  @IsOptional() @IsString()                       clienteNombre?: string;
  @IsDateString()                                 fecha!: string;
  @IsNumber() @Min(0.01) @Type(() => Number)      monto!: number;
  @IsEnum(MetodoPagoRecibo)                        metodoPago!: MetodoPagoRecibo;
  @IsString()                                     concepto!: string;
  @IsOptional() @IsInt() @Type(() => Number)      facturaId?: number;
  @IsOptional() @IsString()                       facturaFolio?: string;
  @IsOptional() @IsInt() @Type(() => Number)      cxcId?: number;
  @IsOptional() @IsString()                       referencia?: string;
  @IsOptional() @IsString()                       notas?: string;
}

@ApiTags('Recibos de Cobro')
@ApiBearerAuth('access-token')
@ApiHeader({ name: 'X-Empresa-ID', required: true })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR)
@Controller('recibos-cobro')
export class RecibosCobrosController {
  constructor(private readonly svc: RecibosCobrosService) {}

  @Get('resumen')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VIEWER)
  resumen() { return this.svc.resumen(); }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR, UserRole.VIEWER)
  listar(
    @Query() pagination: PaginationDto,
    @Query('clienteId') clienteId?: string,
  ) {
    return this.svc.listar(pagination, clienteId ? Number(clienteId) : undefined);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR, UserRole.VIEWER)
  findOne(@Param('id', ParseIntPipe) id: number) { return this.svc.findOne(id); }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Emitir recibo de cobro' })
  crear(@Body() dto: CreateReciboDto, @GetUser() user: User) {
    return this.svc.crear({ ...dto, nombreUsuario: user.nombre }, user.id);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  eliminar(@Param('id', ParseIntPipe) id: number) { return this.svc.eliminar(id); }
}
