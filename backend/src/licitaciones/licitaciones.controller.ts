import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query,
  ParseIntPipe, HttpCode, HttpStatus, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import {
  IsString, IsOptional, IsEnum, IsNumber, IsDateString,
} from 'class-validator';
import { LicitacionesService } from './licitaciones.service';
import { EstadoLicitacion, TipoLicitacion } from './entities/licitacion.entity';
import { PaginationDto } from '../common/dto/pagination.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/enums/user-role.enum';

class CreateLicitacionDto {
  @IsString()                             titulo!:            string;
  @IsString()                             entidadConvocante!: string;
  @IsOptional() @IsString()               rncEntidad?:        string;
  @IsOptional() @IsEnum(TipoLicitacion)   tipo?:              TipoLicitacion;
  @IsDateString()                         fechaPublicacion!:  string;
  @IsOptional() @IsDateString()           fechaLimiteOfertas?:string;
  @IsOptional() @IsDateString()           fechaApertura?:     string;
  @IsOptional() @IsNumber()               montoEstimado?:     number;
  @IsOptional() @IsNumber()               montoOfertado?:     number;
  @IsOptional() @IsString()               requisitos?:        string;
  @IsOptional() @IsString()               descripcion?:       string;
  @IsOptional() @IsString()               enlacePortal?:      string;
}

class CambiarEstadoDto {
  @IsEnum(EstadoLicitacion)               estado!:           EstadoLicitacion;
  @IsOptional() @IsString()               motivo?:           string;
  @IsOptional() @IsNumber()               montoAdjudicado?:  number;
}

@ApiTags('Licitaciones y Propuestas')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR)
@Controller('licitaciones')
export class LicitacionesController {
  constructor(private svc: LicitacionesService) {}

  @Get('dashboard')
  getDashboard() { return this.svc.getDashboard(); }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  crear(@Body() dto: CreateLicitacionDto) { return this.svc.crear(dto); }

  @Get()
  listar(
    @Query() pagination: PaginationDto,
    @Query('estado') estado?: EstadoLicitacion,
  ) { return this.svc.listar(pagination, estado); }

  @Get(':id')
  findById(@Param('id', ParseIntPipe) id: number) { return this.svc.findById(id); }

  @Patch(':id')
  actualizar(@Param('id', ParseIntPipe) id: number, @Body() dto: CreateLicitacionDto) {
    return this.svc.actualizar(id, dto);
  }

  @Patch(':id/estado')
  cambiarEstado(@Param('id', ParseIntPipe) id: number, @Body() dto: CambiarEstadoDto) {
    return this.svc.cambiarEstado(id, dto.estado, dto.motivo);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  eliminar(@Param('id', ParseIntPipe) id: number) { return this.svc.eliminar(id); }
}
