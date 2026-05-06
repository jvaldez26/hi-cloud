import {
  Controller, Get, Patch, Post, Delete, Body, Param, ParseIntPipe,
  UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { IsEnum, IsInt, IsPositive, IsString, IsNotEmpty } from 'class-validator';
import { SuperAdminService } from './super-admin.service';
import { SuperAdminGuard }   from './super-admin.guard';

class CambiarPlanDto {
  @IsEnum(['trial','basico','profesional','empresarial','enterprise'])
  plan!: string;

  @IsInt() @IsPositive()
  meses!: number;
}

class EnviarMensajeDto {
  @IsEnum(['INFO','ALERTA','PROMOCION','MANTENIMIENTO'])
  tipo!: string;

  @IsString() @IsNotEmpty()
  subject!: string;

  @IsString() @IsNotEmpty()
  mensaje!: string;
}

@ApiTags('Super Admin')
@ApiBearerAuth('access-token')
@UseGuards(SuperAdminGuard)
@Controller('admin')
export class SuperAdminController {
  constructor(private svc: SuperAdminService) {}

  @Get('metricas')
  @ApiOperation({ summary: 'Métricas globales de la plataforma' })
  getMetricas() { return this.svc.getMetricas(); }

  @Get('empresas')
  @ApiOperation({ summary: 'Listar todas las empresas con métricas' })
  listarEmpresas() { return this.svc.listarEmpresas(); }

  @Get('empresas/:id')
  @ApiOperation({ summary: 'Detalle de una empresa' })
  getEmpresa(@Param('id', ParseIntPipe) id: number) { return this.svc.getEmpresa(id); }

  @Patch('empresas/:id/suspender')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Suspender empresa' })
  suspender(@Param('id', ParseIntPipe) id: number) { return this.svc.suspenderEmpresa(id); }

  @Patch('empresas/:id/activar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Activar empresa' })
  activar(@Param('id', ParseIntPipe) id: number) { return this.svc.activarEmpresa(id); }

  @Patch('empresas/:id/plan')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cambiar plan de suscripción de una empresa' })
  cambiarPlan(@Param('id', ParseIntPipe) id: number, @Body() dto: CambiarPlanDto) {
    return this.svc.cambiarPlan(id, dto.plan, dto.meses);
  }

  @Post('empresas/:id/mensaje')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Enviar mensaje/notificación a una empresa' })
  enviarMensaje(@Param('id', ParseIntPipe) id: number, @Body() dto: EnviarMensajeDto) {
    return this.svc.enviarMensaje(id, dto.tipo, dto.subject, dto.mensaje);
  }

  @Delete('empresas/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Eliminar empresa (soft delete)' })
  eliminarEmpresa(@Param('id', ParseIntPipe) id: number) { return this.svc.eliminarEmpresa(id); }

  @Get('usuarios')
  @ApiOperation({ summary: 'Listar todos los usuarios del sistema' })
  listarUsuarios() { return this.svc.listarUsuarios(); }

  @Get('suscripciones')
  @ApiOperation({ summary: 'Gestión de suscripciones y planes' })
  listarSuscripciones() { return this.svc.listarSuscripciones(); }
}
