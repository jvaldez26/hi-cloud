import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, ParseIntPipe, UseGuards,
  HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import {
  IsString, IsOptional, IsInt, IsPositive, IsNumber, IsBoolean,
  IsArray, ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { CapacitacionService } from './capacitacion.service';

class CreateCursoDto {
  @IsString()                    nombre!:        string;
  @IsOptional() @IsString()      descripcion?:   string;
  @IsOptional() @IsString()      categoria?:     string;
  @IsOptional() @IsString()      instructor?:    string;
  @IsOptional() @IsNumber()      duracionHoras?: number;
  @IsOptional() @IsString()      modalidad?:     string;
}

class CreateSesionDto {
  @IsInt() @IsPositive()         cursoId!:          number;
  @IsString()                    fecha!:            string;
  @IsOptional() @IsString()      hora?:             string;
  @IsOptional() @IsString()      lugar?:            string;
  @IsOptional() @IsString()      modalidad?:        string;
  @IsOptional() @IsInt()         capacidadMaxima?:  number;
  @IsOptional() @IsString()      notas?:            string;
}

class UpdateSesionDto {
  @IsOptional() @IsString()      estado?:    string;
  @IsOptional() @IsString()      notas?:     string;
  @IsOptional() @IsString()      lugar?:     string;
}

class RegistroItemDto {
  @IsInt() @IsPositive()         empleadoId!:    number;
  @IsBoolean()                   asistio!:       boolean;
  @IsOptional() @IsNumber()      calificacion?:  number;
  @IsOptional() @IsString()      comentarios?:   string;
}

class AsistenciaDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RegistroItemDto)
  registros!: RegistroItemDto[];
}

@ApiTags('capacitacion')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.CONTADOR)
@Controller('capacitacion')
export class CapacitacionController {
  constructor(private readonly svc: CapacitacionService) {}

  @Get('resumen')
  resumen() { return this.svc.resumen(); }

  // ─── Cursos ──────────────────────────────────────────────────────────────────

  @Get('cursos')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR, UserRole.VIEWER)
  listarCursos() { return this.svc.listarCursos(); }

  @Post('cursos')
  crearCurso(@Body() dto: CreateCursoDto) { return this.svc.crearCurso(dto); }

  @Patch('cursos/:id')
  actualizarCurso(@Param('id', ParseIntPipe) id: number, @Body() dto: Partial<CreateCursoDto>) {
    return this.svc.actualizarCurso(id, dto);
  }

  @Delete('cursos/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  eliminarCurso(@Param('id', ParseIntPipe) id: number) { return this.svc.eliminarCurso(id); }

  // ─── Sesiones ────────────────────────────────────────────────────────────────

  @Get('sesiones')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR, UserRole.VIEWER)
  listarSesiones() { return this.svc.listarSesiones(); }

  @Post('sesiones')
  crearSesion(@Body() dto: CreateSesionDto) { return this.svc.crearSesion(dto); }

  @Patch('sesiones/:id')
  actualizarSesion(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateSesionDto) {
    return this.svc.actualizarSesion(id, dto);
  }

  // ─── Registros ───────────────────────────────────────────────────────────────

  @Get('sesiones/:id/registros')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR, UserRole.VIEWER)
  listarRegistros(@Param('id', ParseIntPipe) id: number) {
    return this.svc.listarRegistros(id);
  }

  @Post('sesiones/:id/asistencia')
  registrarAsistencia(@Param('id', ParseIntPipe) id: number, @Body() body: AsistenciaDto) {
    return this.svc.registrarAsistencia(id, body.registros);
  }

  @Patch('registros/:id/certificado')
  emitirCertificado(@Param('id', ParseIntPipe) id: number) {
    return this.svc.emitirCertificado(id);
  }
}
