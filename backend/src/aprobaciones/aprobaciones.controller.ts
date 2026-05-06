import {
  Controller, Get, Post, Patch, Body, Param, Query,
  ParseIntPipe, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiHeader } from '@nestjs/swagger';
import {
  IsEnum, IsOptional, IsInt, IsPositive, IsNumber, IsString,
} from 'class-validator';
import { Type } from 'class-transformer';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { User } from '../users/users.entity';
import { PaginationDto } from '../common/dto/pagination.dto';
import { AprobacionesService } from './aprobaciones.service';
import { EstadoAprobacion, TipoAprobacion } from './entities/aprobacion.entity';

class SolicitarDto {
  @IsEnum(TipoAprobacion)                                tipo!: TipoAprobacion;
  @IsInt() @IsPositive() @Type(() => Number)              entidadId!: number;
  @IsOptional() @IsString()                               entidadRef?: string;
  @IsOptional() @IsNumber() @Type(() => Number)           monto?: number;
  @IsOptional() @IsString()                               comentarioSolicitud?: string;
}

class ResolverDto {
  @IsOptional() @IsString()                               comentario?: string;
}

@ApiTags('Aprobaciones / Workflow')
@ApiBearerAuth('access-token')
@ApiHeader({ name: 'X-Empresa-ID', required: true })
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('aprobaciones')
export class AprobacionesController {
  constructor(private readonly svc: AprobacionesService) {}

  @Get('resumen')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR, UserRole.VIEWER)
  resumen() { return this.svc.resumen(); }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR, UserRole.VIEWER)
  @ApiOperation({ summary: 'Listar aprobaciones — filtrar por ?estado=pendiente&tipo=cotizacion' })
  listar(
    @Query() pagination: PaginationDto,
    @Query('estado') estado?: EstadoAprobacion,
    @Query('tipo')   tipo?:   TipoAprobacion,
  ) { return this.svc.listar(pagination, estado, tipo); }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR, UserRole.VIEWER)
  findOne(@Param('id', ParseIntPipe) id: number) { return this.svc.findOne(id); }

  @Get('estado/:tipo/:entidadId')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR, UserRole.VIEWER)
  @ApiOperation({ summary: 'Estado actual de aprobación de un documento específico' })
  getEstado(
    @Param('tipo')        tipo:       TipoAprobacion,
    @Param('entidadId', ParseIntPipe) entidadId: number,
  ) { return this.svc.getEstado(tipo, entidadId); }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR)
  @ApiOperation({ summary: 'Solicitar aprobación para un documento' })
  solicitar(@Body() dto: SolicitarDto, @GetUser() user: User) {
    return this.svc.solicitar({ ...dto, nombreSolicitante: user.nombre }, user.id);
  }

  @Patch(':id/aprobar')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Aprobar una solicitud (solo ADMIN/CONTADOR)' })
  aprobar(
    @Param('id', ParseIntPipe) id: number,
    @GetUser() user: User,
    @Body() dto: ResolverDto,
  ) { return this.svc.aprobar(id, user.id, user.role, dto.comentario); }

  @Patch(':id/rechazar')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Rechazar una solicitud con comentario obligatorio' })
  rechazar(
    @Param('id', ParseIntPipe) id: number,
    @GetUser() user: User,
    @Body() dto: ResolverDto,
  ) { return this.svc.rechazar(id, user.id, user.role, dto.comentario ?? 'Rechazado'); }
}
