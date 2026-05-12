import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  ParseIntPipe,
  ParseFloatPipe,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { PresupuestosService } from './presupuestos.service';
import { CreatePresupuestoDto, CreatePresupuestoLineaDto } from './dto/create-presupuesto.dto';
import { FiltroPresupuestoDto } from './dto/filtro-presupuesto.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { User } from '../users/users.entity';

@ApiTags('Presupuestos y Planificación')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.CONTADOR)
@Controller('presupuestos')
export class PresupuestosController {
  constructor(private presupuestosService: PresupuestosService) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Dashboard presupuestal: % de ejecución de todos los presupuestos del año' })
  @ApiQuery({ name: 'anio', required: true, example: 2026 })
  getDashboard(@Query('anio') anio: number) {
    return this.presupuestosService.getDashboardPresupuestal(Number(anio));
  }

  @Get('comparativa-anual')
  @ApiOperation({ summary: 'Ventas / Compras / Gastos reales mes a mes (sin comparar con presupuesto)' })
  @ApiQuery({ name: 'anio', required: true, example: 2026 })
  getComparativaAnual(@Query('anio') anio: number) {
    return this.presupuestosService.getComparativaAnual(Number(anio));
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Crear presupuesto (puede incluir líneas mensuales)' })
  create(@Body() dto: CreatePresupuestoDto, @GetUser() usuario: User) {
    return this.presupuestosService.create(dto, usuario.id);
  }

  @Get()
  @ApiOperation({ summary: 'Listar presupuestos con filtros (año, tipo, estado)' })
  getPresupuestos(@Query() filtro: FiltroPresupuestoDto) {
    return this.presupuestosService.getPresupuestos(filtro);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle del presupuesto con todas sus líneas mensuales' })
  findById(@Param('id', ParseIntPipe) id: number) {
    return this.presupuestosService.findById(id);
  }

  @Get(':id/variacion')
  @ApiOperation({ summary: 'Análisis de variación: presupuestado vs real mes a mes con % ejecución' })
  getVariacion(@Param('id', ParseIntPipe) id: number) {
    return this.presupuestosService.getAnalisisVariacion(id);
  }

  @Post(':id/lineas')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Agregar línea mensual al presupuesto' })
  addLinea(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreatePresupuestoLineaDto,
  ) {
    return this.presupuestosService.addLinea(id, dto);
  }

  @Patch('lineas/:lineaId')
  @ApiOperation({ summary: 'Actualizar monto de una línea del presupuesto' })
  updateLinea(
    @Param('lineaId', ParseIntPipe) lineaId: number,
    @Body('monto', ParseFloatPipe) monto: number,
  ) {
    return this.presupuestosService.updateLinea(lineaId, monto);
  }

  @Patch(':id/aprobar')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Aprobar presupuesto (solo ADMIN — bloquea nuevas líneas)' })
  aprobar(@Param('id', ParseIntPipe) id: number) {
    return this.presupuestosService.aprobar(id);
  }

  @Patch(':id/cerrar')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Cerrar presupuesto del período (solo ADMIN)' })
  cerrar(@Param('id', ParseIntPipe) id: number) {
    return this.presupuestosService.cerrar(id);
  }
}
