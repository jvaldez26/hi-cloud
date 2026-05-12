import {
  Controller, Get, Post, Patch, Body, Param, Query,
  ParseIntPipe, HttpCode, HttpStatus, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { IsOptional, IsInt, IsBoolean, Min, IsString } from 'class-validator';
import { PlaneacionDemandaService } from './planeacion-demanda.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/enums/user-role.enum';

class GenerarPlanDto {
  @IsOptional() @IsInt() @Min(1) horizonteMeses?: number;
  @IsOptional() @IsString()      notas?:          string;
  @IsOptional()                  soloConVentas?:  boolean;
}

@ApiTags('Planeación de la Demanda')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('planeacion-demanda')
export class PlaneacionDemandaController {
  constructor(private svc: PlaneacionDemandaService) {}

  @Post('generar')
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Generar plan de demanda — analiza últimos 12 meses de ventas y proyecta N meses' })
  generar(@Body() dto: GenerarPlanDto) {
    return this.svc.generarPlan(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar planes de demanda generados' })
  listar(@Query('page') page?: string) {
    return this.svc.getPlanes(page ? Number(page) : 1);
  }

  @Get('sugerencias')
  @ApiOperation({ summary: 'Sugerencias de compra del último plan aprobado (o más reciente)' })
  @ApiQuery({ name: 'planId', required: false })
  getSugerencias(@Query('planId') planId?: string) {
    return this.svc.getSugerencias(planId ? Number(planId) : undefined);
  }

  @Get('analizar/:productoId')
  @ApiOperation({ summary: 'Análisis rápido de un producto: historial 24m + proyección (sin guardar plan)' })
  analizarProducto(@Param('productoId', ParseIntPipe) productoId: number) {
    return this.svc.analizarProducto(productoId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de un plan de demanda' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.svc.findPlanById(id);
  }

  @Get(':id/lineas')
  @ApiOperation({ summary: 'Líneas del plan — detalle por producto con proyecciones' })
  @ApiQuery({ name: 'soloAlertas', required: false, type: Boolean })
  getLineas(
    @Param('id', ParseIntPipe) id: number,
    @Query('soloAlertas') soloAlertas?: string,
  ) {
    return this.svc.getLineasPlan(id, soloAlertas === 'true');
  }

  @Patch(':id/aprobar')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Aprobar plan de demanda (habilita las sugerencias de compra)' })
  aprobar(@Param('id', ParseIntPipe) id: number) {
    return this.svc.aprobarPlan(id);
  }
}
