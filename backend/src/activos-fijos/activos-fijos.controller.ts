import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { ActivosFijosService } from './activos-fijos.service';
import { CreateCategoriaDto } from './dto/create-categoria.dto';
import { CreateActivoFijoDto } from './dto/create-activo-fijo.dto';
import { DarDeBajaDto } from './dto/dar-de-baja.dto';
import { FiltroActivosDto, FiltroDepreciacionDto } from './dto/filtro-activos.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { User } from '../users/users.entity';

@ApiTags('Activos Fijos')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('activos-fijos')
export class ActivosFijosController {
  constructor(private activosService: ActivosFijosService) {}

  // ── Resumen ────────────────────────────────────────────────────────────────

  @Get('resumen')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Resumen de activos: costo histórico, depreciación acumulada, valor en libros' })
  getResumen() {
    return this.activosService.getResumenActivos();
  }

  // ── Categorías DGII ────────────────────────────────────────────────────────

  @Get('categorias')
  @ApiOperation({ summary: 'Categorías DGII (Ley 11-92): tasas y métodos por tipo de activo' })
  getCategorias() {
    return this.activosService.getCategorias();
  }

  @Post('categorias')
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Crear categoría de activo personalizada (solo ADMIN)' })
  createCategoria(@Body() dto: CreateCategoriaDto) {
    return this.activosService.createCategoria(dto);
  }

  // ── Activos ────────────────────────────────────────────────────────────────

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Registrar nuevo activo fijo' })
  createActivo(@Body() dto: CreateActivoFijoDto, @GetUser() usuario: User) {
    return this.activosService.createActivo(dto, usuario.id);
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Listar activos con filtros (categoría, estado)' })
  getActivos(@Query() filtro: FiltroActivosDto) {
    return this.activosService.getActivos(filtro);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Detalle de activo fijo' })
  findActivo(@Param('id', ParseIntPipe) id: number) {
    return this.activosService.findActivoById(id);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Actualizar activo fijo (solo activos en estado ACTIVO)' })
  updateActivo(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: Partial<CreateActivoFijoDto>,
  ) {
    return this.activosService.updateActivo(id, dto);
  }

  @Patch(':id/dar-de-baja')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Dar de baja o registrar venta de un activo (solo ADMIN)' })
  darDeBaja(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: DarDeBajaDto,
    @GetUser() usuario: User,
  ) {
    return this.activosService.darDeBaja(id, dto, usuario.id);
  }

  @Get(':id/historial')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Historial de depreciación de un activo (período a período)' })
  getHistorial(@Param('id', ParseIntPipe) id: number) {
    return this.activosService.getHistorialActivo(id);
  }

  // ── Depreciación ───────────────────────────────────────────────────────────

  @Post('depreciacion/procesar')
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Procesar depreciación mensual para todos los activos activos' })
  procesarDepreciacion(
    @Body('periodo') periodo: string,
    @GetUser() usuario: User,
  ) {
    return this.activosService.procesarDepreciacionMensual(periodo, usuario.id);
  }

  @Get('depreciacion/registros')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Listar registros de depreciación con filtros' })
  getDepreciaciones(@Query() filtro: FiltroDepreciacionDto) {
    return this.activosService.getDepreciaciones(filtro);
  }

  // ── Reporte DGII ───────────────────────────────────────────────────────────

  @Get('reporte-dgii/:anio')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Reporte DGII de activos fijos del año (Ley 11-92 Art. 287)' })
  getReporteDGII(@Param('anio', ParseIntPipe) anio: number) {
    return this.activosService.getReporteDGII(anio);
  }
}
