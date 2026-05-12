import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query,
  ParseIntPipe, HttpCode, HttpStatus, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import {
  IsInt, IsPositive, IsOptional, IsString, IsEnum, IsObject,
} from 'class-validator';
import { EvaluacionesService } from './evaluaciones.service';
import { PeriodoEvaluacion } from './entities/evaluacion.entity';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { User } from '../users/users.entity';

class CreateEvaluacionDto {
  @IsInt() @IsPositive()                        empleadoId!: number;
  @IsOptional() @IsEnum(PeriodoEvaluacion)      periodo?: PeriodoEvaluacion;
  @IsInt()                                       anio!: number;
  @IsOptional() @IsInt()                         semestre?: number;
  @IsOptional() @IsObject()                      criterios?: Record<string, number>;
  @IsOptional() @IsString()                      fortalezas?: string;
  @IsOptional() @IsString()                      areasImprovement?: string;
  @IsOptional() @IsString()                      comentarios?: string;
}

class UpdateEvaluacionDto extends CreateEvaluacionDto {}

@ApiTags('Evaluaciones de Empleados')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.CONTADOR)
@Controller('evaluaciones')
export class EvaluacionesController {
  constructor(private svc: EvaluacionesService) {}

  @Get('criterios')
  getCriterios() { return this.svc.getCriterios(); }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  crear(@Body() dto: CreateEvaluacionDto, @GetUser() user: User) {
    return this.svc.crear(dto, user.id);
  }

  @Get()
  listar(
    @Query('anio')      anio?:      string,
    @Query('periodo')   periodo?:   PeriodoEvaluacion,
    @Query('empleadoId')empleadoId?:string,
  ) { return this.svc.listar(anio ? Number(anio) : undefined, periodo, empleadoId ? Number(empleadoId) : undefined); }

  @Get('resumen-equipo')
  getResumen(
    @Query('anio')    anio:    string,
    @Query('periodo') periodo?: PeriodoEvaluacion,
  ) { return this.svc.getResumenEquipo(Number(anio), periodo); }

  @Get('empleado/:id/historico')
  getHistorico(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getHistoricoEmpleado(id);
  }

  @Get(':id')
  findById(@Param('id', ParseIntPipe) id: number) { return this.svc.findById(id); }

  @Patch(':id')
  actualizar(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateEvaluacionDto) {
    return this.svc.actualizar(id, dto);
  }

  @Patch(':id/completar')
  completar(@Param('id', ParseIntPipe) id: number) { return this.svc.completar(id); }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  eliminar(@Param('id', ParseIntPipe) id: number) { return this.svc.eliminar(id); }
}
