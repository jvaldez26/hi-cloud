import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query,
  ParseIntPipe, HttpCode, HttpStatus, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import {
  IsInt, IsPositive, IsString, IsOptional, IsBoolean,
  IsDateString, IsEnum, IsNumber, Min, Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { VacacionesService } from './vacaciones.service';
import { EstadoSolicitud } from './entities/solicitud-vacacion.entity';
import { TipoAusencia } from './entities/ausencia.entity';
import { PaginationDto } from '../common/dto/pagination.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { User } from '../users/users.entity';

class CreateSolicitudDto {
  @IsInt() @IsPositive()    empleadoId:  number;
  @IsDateString()           fechaInicio: string;
  @IsDateString()           fechaFin:    string;
  @IsOptional() @IsString() motivo?:     string;
}

class RespondSolicitudDto {
  @IsOptional() @IsString() observacion?: string;
}

class CreateAusenciaDto {
  @IsInt() @IsPositive()                       empleadoId:  number;
  @IsDateString()                              fecha:       string;
  @IsEnum(TipoAusencia)                        tipo:        TipoAusencia;
  @IsOptional() @IsBoolean()                   justificada?: boolean;
  @IsOptional() @IsString()                    descripcion?: string;
  @IsOptional() @IsNumber() @Min(0.5) @Max(1)  dias?:        number;
}

@ApiTags('Vacaciones y Ausencias')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.CONTADOR)
@Controller('vacaciones')
export class VacacionesController {
  constructor(private svc: VacacionesService) {}

  // ── Balance ──────────────────────────────────────────────────────────────────

  @Get('balance')
  @ApiOperation({ summary: 'Balance de vacaciones de todos los empleados' })
  getBalanceTodos(@Query('anio') anio?: string) {
    return this.svc.getBalanceTodos(anio ? Number(anio) : undefined);
  }

  @Get('balance/:empleadoId')
  @ApiOperation({ summary: 'Balance de vacaciones de un empleado' })
  getBalance(
    @Param('empleadoId', ParseIntPipe) empleadoId: number,
    @Query('anio') anio?: string,
  ) {
    return this.svc.getBalance(empleadoId, anio ? Number(anio) : undefined);
  }

  // ── Resumen ──────────────────────────────────────────────────────────────────

  @Get('resumen')
  @ApiOperation({ summary: 'Resumen mensual de ausencias y vacaciones' })
  getResumen(
    @Query('mes')  mes:  string,
    @Query('anio') anio: string,
  ) {
    return this.svc.getResumenMes(Number(mes), Number(anio));
  }

  // ── Solicitudes ──────────────────────────────────────────────────────────────

  @Post('solicitudes')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Crear solicitud de vacaciones' })
  crear(@Body() dto: CreateSolicitudDto, @GetUser() user: User) {
    return this.svc.crearSolicitud(dto, user.id);
  }

  @Get('solicitudes')
  @ApiOperation({ summary: 'Listar solicitudes de vacaciones' })
  listar(
    @Query() pagination: PaginationDto,
    @Query('estado') estado?: EstadoSolicitud,
    @Query('empleadoId') empleadoId?: string,
  ) {
    return this.svc.listarSolicitudes(pagination, estado, empleadoId ? Number(empleadoId) : undefined);
  }

  @Patch('solicitudes/:id/aprobar')
  @ApiOperation({ summary: 'Aprobar solicitud de vacaciones' })
  aprobar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RespondSolicitudDto,
    @GetUser() user: User,
  ) {
    return this.svc.aprobar(id, user.id, dto.observacion);
  }

  @Patch('solicitudes/:id/rechazar')
  @ApiOperation({ summary: 'Rechazar solicitud de vacaciones' })
  rechazar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RespondSolicitudDto,
    @GetUser() user: User,
  ) {
    return this.svc.rechazar(id, user.id, dto.observacion);
  }

  // ── Ausencias ────────────────────────────────────────────────────────────────

  @Post('ausencias')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Registrar ausencia de empleado' })
  registrarAusencia(@Body() dto: CreateAusenciaDto, @GetUser() user: User) {
    return this.svc.registrarAusencia(dto, user.id);
  }

  @Get('ausencias')
  @ApiOperation({ summary: 'Listar ausencias' })
  listarAusencias(
    @Query() pagination: PaginationDto,
    @Query('empleadoId') empleadoId?: string,
    @Query('mes')  mes?:  string,
    @Query('anio') anio?: string,
  ) {
    return this.svc.listarAusencias(
      pagination,
      empleadoId ? Number(empleadoId) : undefined,
      mes  ? Number(mes)  : undefined,
      anio ? Number(anio) : undefined,
    );
  }

  @Delete('ausencias/:id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Eliminar registro de ausencia' })
  eliminarAusencia(@Param('id', ParseIntPipe) id: number) {
    return this.svc.eliminarAusencia(id);
  }
}
