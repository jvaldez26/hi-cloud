import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, ParseIntPipe, UseGuards,
  HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { IsString, IsOptional, IsInt, IsPositive, IsBoolean } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { EncuestasService } from './encuestas.service';

class CreateEncuestaDto {
  @IsString()              titulo!:        string;
  @IsOptional() @IsString() tipo?:          string;
  @IsOptional() @IsString() descripcion?:  string;
}

class UpdateEncuestaDto {
  @IsOptional() @IsString()   titulo?:       string;
  @IsOptional() @IsBoolean()  activa?:       boolean;
  @IsOptional() @IsString()   descripcion?:  string;
}

class ResponderDto {
  @IsOptional() @IsInt() @IsPositive()  encuestaId?:        number;
  @IsOptional() @IsString()             tokenPublico?:      string;
  @IsOptional() @IsInt() @IsPositive()  clienteId?:         number;
  @IsOptional() @IsString()             nombreRespondente?: string;
  @IsOptional()                         puntuacion?:        number;
  @IsOptional()                         respuestas?:        Record<string, string | number>;
  @IsOptional() @IsString()             comentarios?:       string;
}

@ApiTags('encuestas')
@Controller('encuestas')
export class EncuestasController {
  constructor(private readonly svc: EncuestasService) {}

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR)
  @Get()
  listar() { return this.svc.listar(); }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR)
  @Post()
  crear(@Body() dto: CreateEncuestaDto) { return this.svc.crear(dto); }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR)
  @Patch(':id')
  actualizar(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateEncuestaDto) {
    return this.svc.actualizar(id, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  eliminar(@Param('id', ParseIntPipe) id: number) { return this.svc.eliminar(id); }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR)
  @Get(':id/respuestas')
  listarRespuestas(@Param('id', ParseIntPipe) id: number) {
    return this.svc.listarRespuestas(id);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR)
  @Get(':id/metricas')
  metricas(@Param('id', ParseIntPipe) id: number) { return this.svc.metricas(id); }

  // Público — responder vía link o token
  @Post('responder')
  responder(@Body() dto: ResponderDto) { return this.svc.registrarRespuesta(dto); }
}
