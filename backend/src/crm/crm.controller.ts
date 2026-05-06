import { PlanGuard } from '../suscripciones/guards/plan.guard';
import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query,
  ParseIntPipe, HttpCode, HttpStatus, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import {
  IsString, IsOptional, IsEnum, IsNumber, IsInt, IsPositive,
  IsEmail, IsDateString, IsBoolean, Min, Max,
} from 'class-validator';
import { CRMService } from './crm.service';
import { EstadoLead, FuenteLead } from './entities/lead.entity';
import { EtapaOportunidad } from './entities/oportunidad.entity';
import { TipoActividad } from './entities/actividad-crm.entity';
import { PaginationDto } from '../common/dto/pagination.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { RequiereModulo } from '../suscripciones/decorators/requiere-modulo.decorator';

class CreateLeadDto {
  @IsString()                               nombre!: string;
  @IsOptional() @IsString()                 empresa?: string;
  @IsOptional() @IsString()                 cargo?: string;
  @IsOptional() @IsEmail()                  email?: string;
  @IsOptional() @IsString()                 telefono?: string;
  @IsOptional() @IsEnum(FuenteLead)         fuente?: FuenteLead;
  @IsOptional() @IsNumber() @IsPositive()   valorEstimado?: number;
  @IsOptional() @IsString()                 notas?: string;
  @IsOptional() @IsInt() @IsPositive()      responsableId?: number;
}

class UpdateLeadDto extends CreateLeadDto {
  @IsOptional() @IsEnum(EstadoLead)         estado?: EstadoLead;
}

class ConvertirLeadDto {
  @IsInt() @IsPositive()                    clienteId!: number;
}

class CreateOportunidadDto {
  @IsString()                               titulo!: string;
  @IsOptional() @IsString()                 empresa?: string;
  @IsOptional() @IsInt() @IsPositive()      clienteId?: number;
  @IsOptional() @IsInt() @IsPositive()      leadId?: number;
  @IsOptional() @IsEnum(EtapaOportunidad)   etapa?: EtapaOportunidad;
  @IsOptional() @IsNumber()                 valor?: number;
  @IsOptional() @IsInt() @Min(0) @Max(100)  probabilidad?: number;
  @IsOptional() @IsDateString()             fechaCierreEsperada?: string;
  @IsOptional() @IsString()                 descripcion?: string;
  @IsOptional() @IsInt() @IsPositive()      responsableId?: number;
}

class CambiarEtapaDto {
  @IsEnum(EtapaOportunidad)                 etapa!: EtapaOportunidad;
  @IsOptional() @IsString()                 motivoPerdida?: string;
}

class CreateActividadDto {
  @IsEnum(TipoActividad)                    tipo!: TipoActividad;
  @IsString()                               descripcion!: string;
  @IsDateString()                           fecha!: string;
  @IsOptional() @IsInt() @IsPositive()      leadId?: number;
  @IsOptional() @IsInt() @IsPositive()      oportunidadId?: number;
  @IsOptional() @IsInt() @IsPositive()      usuarioId?: number;
}

@ApiTags('CRM')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR)
@UseGuards(PlanGuard)
@RequiereModulo('crm')
@Controller('crm')
export class CRMController {
  constructor(private svc: CRMService) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'KPIs y resumen del CRM' })
  getDashboard() { return this.svc.getDashboard(); }

  // ── Leads ────────────────────────────────────────────────────────────────────

  @Post('leads')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Crear lead' })
  crearLead(@Body() dto: CreateLeadDto) { return this.svc.crearLead(dto); }

  @Get('leads')
  @ApiOperation({ summary: 'Listar leads' })
  listarLeads(
    @Query() pagination: PaginationDto,
    @Query('estado') estado?: EstadoLead,
    @Query('fuente') fuente?: FuenteLead,
  ) { return this.svc.listarLeads(pagination, estado, fuente); }

  @Patch('leads/:id')
  @ApiOperation({ summary: 'Actualizar lead' })
  actualizarLead(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateLeadDto) {
    return this.svc.actualizarLead(id, dto);
  }

  @Patch('leads/:id/convertir')
  @ApiOperation({ summary: 'Convertir lead a cliente' })
  convertirLead(@Param('id', ParseIntPipe) id: number, @Body() dto: ConvertirLeadDto) {
    return this.svc.convertirLead(id, dto.clienteId);
  }

  @Delete('leads/:id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Eliminar lead' })
  eliminarLead(@Param('id', ParseIntPipe) id: number) { return this.svc.eliminarLead(id); }

  // ── Oportunidades ────────────────────────────────────────────────────────────

  @Post('oportunidades')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Crear oportunidad' })
  crearOportunidad(@Body() dto: CreateOportunidadDto) { return this.svc.crearOportunidad(dto); }

  @Get('oportunidades')
  @ApiOperation({ summary: 'Listar oportunidades (pipeline)' })
  listarOportunidades(
    @Query() pagination: PaginationDto,
    @Query('etapa') etapa?: EtapaOportunidad,
  ) { return this.svc.listarOportunidades(pagination, etapa); }

  @Patch('oportunidades/:id')
  @ApiOperation({ summary: 'Actualizar oportunidad' })
  actualizarOportunidad(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateOportunidadDto,
  ) { return this.svc.actualizarOportunidad(id, dto); }

  @Patch('oportunidades/:id/etapa')
  @ApiOperation({ summary: 'Cambiar etapa del pipeline' })
  cambiarEtapa(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CambiarEtapaDto,
  ) { return this.svc.actualizarEtapa(id, dto.etapa, dto.motivoPerdida); }

  @Delete('oportunidades/:id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Eliminar oportunidad' })
  eliminarOportunidad(@Param('id', ParseIntPipe) id: number) {
    return this.svc.eliminarOportunidad(id);
  }

  // ── Actividades ──────────────────────────────────────────────────────────────

  @Post('actividades')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Registrar actividad CRM' })
  crearActividad(@Body() dto: CreateActividadDto) { return this.svc.crearActividad(dto); }

  @Get('actividades')
  @ApiOperation({ summary: 'Listar actividades' })
  listarActividades(
    @Query('leadId')        leadId?:        string,
    @Query('oportunidadId') oportunidadId?: string,
  ) {
    return this.svc.listarActividades(
      leadId        ? Number(leadId)        : undefined,
      oportunidadId ? Number(oportunidadId) : undefined,
    );
  }

  @Patch('actividades/:id/completar')
  @ApiOperation({ summary: 'Marcar actividad como completada' })
  completarActividad(@Param('id', ParseIntPipe) id: number) {
    return this.svc.completarActividad(id);
  }
}
