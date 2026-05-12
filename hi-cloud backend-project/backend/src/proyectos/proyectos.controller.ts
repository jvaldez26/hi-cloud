import { PlanGuard } from '../suscripciones/guards/plan.guard';
import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query,
  ParseIntPipe, HttpCode, HttpStatus, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import {
  IsString, IsOptional, IsEnum, IsNumber, IsInt, IsPositive,
  IsDateString, IsBoolean, Min, Max,
} from 'class-validator';
import { ProyectosService } from './proyectos.service';
import { EstadoProyecto, TipoFacturacion } from './entities/proyecto.entity';
import { EstadoTarea, PrioridadTarea } from './entities/tarea.entity';
import { CategoriaPresupuesto } from './entities/presupuesto-proyecto-linea.entity';
import { PaginationDto } from '../common/dto/pagination.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RequiereModulo } from '../suscripciones/decorators/requiere-modulo.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { User } from '../users/users.entity';

class CreateProyectoDto {
  @IsString()                                 nombre!: string;
  @IsOptional() @IsString()                   descripcion?: string;
  @IsOptional() @IsInt() @IsPositive()        clienteId?: number;
  @IsDateString()                             fechaInicio!: string;
  @IsOptional() @IsDateString()               fechaFin?: string;
  @IsOptional() @IsEnum(EstadoProyecto)       estado?: EstadoProyecto;
  @IsOptional() @IsEnum(TipoFacturacion)      tipoFacturacion?: TipoFacturacion;
  @IsOptional() @IsNumber() @Min(0)           presupuesto?: number;
  @IsOptional() @IsNumber() @Min(0)           horasEstimadas?: number;
  @IsOptional() @IsNumber() @Min(0)           tarifaHora?: number;
  @IsOptional() @IsInt() @IsPositive()        responsableId?: number;
  @IsOptional() @IsString()                   notas?: string;
}

class CreateTareaDto {
  @IsInt() @IsPositive()                      proyectoId!: number;
  @IsString()                                 titulo!: string;
  @IsOptional() @IsString()                   descripcion?: string;
  @IsOptional() @IsEnum(EstadoTarea)          estado?: EstadoTarea;
  @IsOptional() @IsEnum(PrioridadTarea)       prioridad?: PrioridadTarea;
  @IsOptional() @IsDateString()               fechaInicio?: string;
  @IsOptional() @IsDateString()               fechaVencimiento?: string;
  @IsOptional() @IsNumber() @Min(0)           horasEstimadas?: number;
  @IsOptional() @IsNumber() @Min(0)           horasReales?: number;
  @IsOptional() @IsInt() @IsPositive()        asignadoId?: number;
  @IsOptional() @IsInt() @Min(0)              orden?: number;
  @IsOptional() @IsBoolean()                  esHito?: boolean;
}

class PresupuestoLineaDto {
  @IsEnum(CategoriaPresupuesto)               categoria!: CategoriaPresupuesto;
  @IsString()                                 descripcion!: string;
  @IsNumber() @Min(0)                         monto!: number;
  @IsOptional() @IsNumber() @Min(0)           montoReal?: number;
  @IsOptional() @IsString()                   notas?: string;
}

class HitoDto {
  @IsString()                                 nombre!: string;
  @IsDateString()                             fecha!: string;
  @IsOptional() @IsString()                   descripcion?: string;
  @IsOptional() @IsBoolean()                  completado?: boolean;
}

class CreateRegistroDto {
  @IsInt() @IsPositive()                      proyectoId!: number;
  @IsOptional() @IsInt() @IsPositive()        tareaId?: number;
  @IsDateString()                             fecha!: string;
  @IsNumber() @Min(0.25) @Max(24)             horas!: number;
  @IsOptional() @IsString()                   descripcion?: string;
}

@ApiTags('Proyectos')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR)
@UseGuards(PlanGuard)
@RequiereModulo('proyectos')
@Controller('proyectos')
export class ProyectosController {
  constructor(private svc: ProyectosService) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'KPIs y proyectos activos' })
  getDashboard() { return this.svc.getDashboard(); }

  // ── Proyectos ────────────────────────────────────────────────────────────────

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Crear proyecto' })
  crear(@Body() dto: CreateProyectoDto) { return this.svc.crear(dto); }

  @Get()
  @ApiOperation({ summary: 'Listar proyectos' })
  listar(
    @Query() pagination: PaginationDto,
    @Query('estado')    estado?:    EstadoProyecto,
    @Query('clienteId') clienteId?: string,
  ) { return this.svc.listar(pagination, estado, clienteId ? Number(clienteId) : undefined); }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de proyecto' })
  findById(@Param('id', ParseIntPipe) id: number) { return this.svc.findById(id); }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar proyecto' })
  actualizar(@Param('id', ParseIntPipe) id: number, @Body() dto: CreateProyectoDto) {
    return this.svc.actualizar(id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Eliminar proyecto' })
  eliminar(@Param('id', ParseIntPipe) id: number) { return this.svc.eliminar(id); }

  // ── Tareas ───────────────────────────────────────────────────────────────────

  @Get(':id/tareas')
  @ApiOperation({ summary: 'Tareas de un proyecto' })
  getTareas(@Param('id', ParseIntPipe) id: number) { return this.svc.getTareas(id); }

  @Post('tareas')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Crear tarea en proyecto' })
  crearTarea(@Body() dto: CreateTareaDto) { return this.svc.crearTarea(dto); }

  @Patch('tareas/:id')
  @ApiOperation({ summary: 'Actualizar tarea' })
  actualizarTarea(@Param('id', ParseIntPipe) id: number, @Body() dto: CreateTareaDto) {
    return this.svc.actualizarTarea(id, dto);
  }

  @Delete('tareas/:id')
  @ApiOperation({ summary: 'Eliminar tarea' })
  eliminarTarea(@Param('id', ParseIntPipe) id: number) { return this.svc.eliminarTarea(id); }

  // ── Tiempos ──────────────────────────────────────────────────────────────────

  @Get(':id/tiempos')
  @ApiOperation({ summary: 'Registros de tiempo del proyecto' })
  getTiempos(
    @Param('id', ParseIntPipe) id: number,
    @Query('page') page?: string,
  ) { return this.svc.getTiempos(id, page ? Number(page) : 1); }

  @Post('tiempos')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Registrar horas trabajadas' })
  registrarTiempo(@Body() dto: CreateRegistroDto, @GetUser() user: User) {
    return this.svc.registrarTiempo({ ...dto, usuarioId: user.id });
  }

  @Delete('tiempos/:id')
  @ApiOperation({ summary: 'Eliminar registro de tiempo' })
  eliminarTiempo(@Param('id', ParseIntPipe) id: number) { return this.svc.eliminarTiempo(id); }

  // ── Gantt ────────────────────────────────────────────────────────────────────

  @Get(':id/gantt')
  @ApiOperation({ summary: 'Datos para diagrama de Gantt — tareas e hitos con offset en días' })
  getGantt(@Param('id', ParseIntPipe) id: number) { return this.svc.getGanttData(id); }

  // ── Presupuesto ───────────────────────────────────────────────────────────────

  @Get(':id/presupuesto')
  @ApiOperation({ summary: 'Presupuesto del proyecto vs real, por categoría' })
  getPresupuesto(@Param('id', ParseIntPipe) id: number) { return this.svc.getPresupuesto(id); }

  @Post(':id/presupuesto')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Agregar línea al presupuesto del proyecto' })
  addPresupuesto(@Param('id', ParseIntPipe) id: number, @Body() dto: PresupuestoLineaDto) {
    return this.svc.addPresupuestoLinea(id, dto);
  }

  @Patch('presupuesto/:id')
  @ApiOperation({ summary: 'Actualizar línea de presupuesto (monto, montoReal)' })
  updatePresupuesto(@Param('id', ParseIntPipe) id: number, @Body() dto: PresupuestoLineaDto) {
    return this.svc.updatePresupuestoLinea(id, dto);
  }

  @Delete('presupuesto/:id')
  @ApiOperation({ summary: 'Eliminar línea de presupuesto' })
  deletePresupuesto(@Param('id', ParseIntPipe) id: number) { return this.svc.deletePresupuestoLinea(id); }

  // ── Hitos ────────────────────────────────────────────────────────────────────

  @Get(':id/hitos')
  @ApiOperation({ summary: 'Hitos del proyecto ordenados por fecha' })
  getHitos(@Param('id', ParseIntPipe) id: number) { return this.svc.getHitos(id); }

  @Post(':id/hitos')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Crear hito del proyecto' })
  createHito(@Param('id', ParseIntPipe) id: number, @Body() dto: HitoDto) {
    return this.svc.createHito(id, dto);
  }

  @Patch('hitos/:id')
  @ApiOperation({ summary: 'Actualizar o completar hito' })
  updateHito(@Param('id', ParseIntPipe) id: number, @Body() dto: HitoDto) {
    return this.svc.updateHito(id, dto);
  }

  @Delete('hitos/:id')
  @ApiOperation({ summary: 'Eliminar hito' })
  deleteHito(@Param('id', ParseIntPipe) id: number) { return this.svc.deleteHito(id); }
}
