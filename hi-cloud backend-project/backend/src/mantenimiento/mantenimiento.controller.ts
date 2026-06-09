import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query,
  ParseIntPipe, HttpCode, HttpStatus, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import {
  IsString, IsOptional, IsEnum, IsNumber, IsInt, IsPositive, IsDateString, Min,
  IsArray, ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { MantenimientoService } from './mantenimiento.service';
import { EstadoMantenimiento, TipoMantenimiento, PrioridadMantenimiento } from './entities/orden-mantenimiento.entity';
import { PaginationDto } from '../common/dto/pagination.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { User } from '../users/users.entity';

class CreateOrdenDto {
  @IsInt() @IsPositive()                    activoId!:         number;
  @IsEnum(TipoMantenimiento)               tipo!:             TipoMantenimiento;
  @IsOptional() @IsEnum(PrioridadMantenimiento) prioridad?:  PrioridadMantenimiento;
  @IsString()                               descripcion!:     string;
  @IsDateString()                           fechaProgramada!: string;
  @IsOptional() @IsNumber() @Min(0)         costoEstimado?:   number;
  @IsOptional() @IsString()                 tecnico?:         string;
}

class RepuestoUsadoDto {
  @IsString()               descripcion!: string;
  @IsNumber() @Min(0)       costo!:       number;
}

class CompletarOrdenDto {
  @IsOptional() @IsNumber() @Min(0) @Type(() => Number) costoReal?:            number;
  @IsOptional() @IsString()                             observaciones?:        string;
  @IsOptional() @IsString()                             tecnico?:              string;
  @IsOptional() @IsDateString()                         fechaRealizada?:       string;
  @IsOptional() @IsDateString()                         proximoMantenimiento?: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => RepuestoUsadoDto)
  repuestosUsados?: RepuestoUsadoDto[];
}

class CreateProgramaDto {
  @IsInt() @IsPositive()                    activoId!:        number;
  @IsEnum(TipoMantenimiento)               tipo!:            TipoMantenimiento;
  @IsString()                               descripcion!:     string;
  @IsInt() @Min(1)                          frecuenciaDias!:  number;
  @IsOptional() @IsNumber() @Min(0)         costoEstimado?:   number;
}

@ApiTags('Mantenimiento de Equipos')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR)
@Controller('mantenimiento')
export class MantenimientoController {
  constructor(private svc: MantenimientoService) {}

  @Get('dashboard')
  getDashboard() { return this.svc.getDashboard(); }

  // Órdenes
  @Post('ordenes')
  @HttpCode(HttpStatus.CREATED)
  crearOrden(@Body() dto: CreateOrdenDto, @GetUser() user: User) {
    return this.svc.crearOrden(dto, user.id);
  }

  @Get('ordenes/:id')
  findOrden(@Param('id', ParseIntPipe) id: number) {
    return this.svc.findOrdenById(id);
  }

  @Get('ordenes')
  listarOrdenes(
    @Query() pagination: PaginationDto,
    @Query('estado')   estado?:   EstadoMantenimiento,
    @Query('activoId') activoId?: string,
  ) { return this.svc.listarOrdenes(pagination, estado, activoId ? Number(activoId) : undefined); }

  @Patch('ordenes/:id/completar')
  completar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CompletarOrdenDto,
    @GetUser() user: User,
  ) {
    return this.svc.completarOrden(id, dto, user.id);
  }

  @Patch('ordenes/:id/cancelar')
  cancelar(@Param('id', ParseIntPipe) id: number) {
    return this.svc.cancelarOrden(id);
  }

  // Programas preventivos
  @Post('programas')
  @HttpCode(HttpStatus.CREATED)
  crearPrograma(@Body() dto: CreateProgramaDto) { return this.svc.crearPrograma(dto); }

  @Get('programas')
  listarProgramas() { return this.svc.listarProgramas(); }

  @Delete('programas/:id')
  @Roles(UserRole.ADMIN)
  eliminarPrograma(@Param('id', ParseIntPipe) id: number) { return this.svc.eliminarPrograma(id); }
}
