import { PlanGuard } from '../suscripciones/guards/plan.guard';
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
  Res,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import type { Response } from 'express';
import { ECFService } from './ecf.service';
import { CreateSecuenciaECFDto } from './dto/create-secuencia-ecf.dto';
import { UpdateEstadoECFDto } from './dto/update-estado-ecf.dto';
import { FiltroECFDto } from './dto/filtro-ecf.dto';
import { CreateProveedorECFDto } from './dto/create-proveedor-ecf.dto';
import { UpdateProveedorECFDto } from './dto/update-proveedor-ecf.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { User } from '../users/users.entity';
import { RequiereModulo } from '../suscripciones/decorators/requiere-modulo.decorator';

@ApiTags('e-CF (Comprobantes Fiscales Electrónicos)')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@UseGuards(PlanGuard)
@RequiereModulo('ecf')
@Controller('ecf')
export class ECFController {
  constructor(private ecfService: ECFService) {}

  // ── Tipos ──────────────────────────────────────────────────────────

  @Get('tipos')
  @ApiOperation({ summary: 'Listar todos los tipos de e-CF DGII (E31–E47)' })
  getTipos() {
    return this.ecfService.getTipos();
  }

  // ── Secuencias ─────────────────────────────────────────────────────

  @Get('secuencias')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Listar secuencias autorizadas por la DGII' })
  getSecuencias(@Query() pagination: PaginationDto) {
    return this.ecfService.getSecuencias(pagination);
  }

  @Post('secuencias')
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Registrar nueva secuencia autorizada por DGII (solo ADMIN)' })
  createSecuencia(
    @Body() dto: CreateSecuenciaECFDto,
    @GetUser() usuario: User,
  ) {
    return this.ecfService.createSecuencia(dto, usuario.id);
  }

  @Get('secuencias/resumen')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Resumen de secuencias por tipo e-CF con porcentaje de uso' })
  getResumenSecuencias() {
    return this.ecfService.getResumenSecuencias();
  }

  @Get('secuencias/proximas-vencer')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Secuencias con ≥85% uso, ≤50 disponibles o vencen en ≤30 días' })
  getSecuenciasProximasVencer() {
    return this.ecfService.getSecuenciasProximasVencer();
  }

  @Patch('secuencias/:id/desactivar')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Desactivar una secuencia (solo ADMIN)' })
  desactivarSecuencia(
    @Param('id', ParseIntPipe) id: number,
    @GetUser() usuario: User,
  ) {
    return this.ecfService.desactivarSecuencia(id, usuario.id);
  }

  @Get('estadisticas')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Estadísticas de e-CFs por tipo (opcional: ?mes=5&anio=2026)' })
  getEstadisticas(
    @Query('mes')  mes?: string,
    @Query('anio') anio?: string,
  ) {
    return this.ecfService.getEstadisticasPorTipo(
      mes  ? Number(mes)  : undefined,
      anio ? Number(anio) : undefined,
    );
  }

  // ── e-CFs ──────────────────────────────────────────────────────────

  @Get()
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Listar e-CFs con filtros opcionales (?estado=&tipo=E31&fecha=2026-05)' })
  getECFs(@Query() filtro: FiltroECFDto) {
    return this.ecfService.getECFs(filtro);
  }

  @Get('pendientes')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'e-CFs pendientes de respuesta del proveedor' })
  getPendientes() {
    return this.ecfService.getECFsPendientes();
  }

  @Get('rechazados')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'e-CFs rechazados disponibles para reenvío' })
  getRechazados() {
    return this.ecfService.getECFsRechazados();
  }

  @Get(':numero')
  @ApiOperation({ summary: 'Obtener e-CF completo por número (ej: E310000000001)' })
  getECFByNumero(@Param('numero') numero: string) {
    return this.ecfService.getECFByNumero(numero);
  }

  @Get(':numero/xml')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Descargar XML del e-CF' })
  async getXML(@Param('numero') numero: string, @Res() res: Response) {
    const xml = await this.ecfService.getXML(numero);
    res.setHeader('Content-Type', 'application/xml');
    res.setHeader('Content-Disposition', `attachment; filename="${numero}.xml"`);
    res.send(xml);
  }

  @Patch(':numero/estado')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Actualizar estado DGII manualmente (solo ADMIN)' })
  actualizarEstado(
    @Param('numero') numero: string,
    @Body() dto: UpdateEstadoECFDto,
  ) {
    return this.ecfService.actualizarEstadoDGII(numero, dto);
  }

  @Post(':numero/reenviar')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Reintentar envío al proveedor (máx 3 intentos)' })
  reenviar(@Param('numero') numero: string) {
    return this.ecfService.reintentarEnvio(numero);
  }

  // ── Proveedor e-CF ─────────────────────────────────────────────────

  @Get('config/proveedor')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Obtener configuración del proveedor e-CF activo' })
  getProveedor() {
    return this.ecfService.getProveedor();
  }

  @Post('config/proveedor')
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Configurar proveedor e-CF (solo ADMIN, reemplaza el activo)' })
  createProveedor(@Body() dto: CreateProveedorECFDto) {
    return this.ecfService.createProveedor(dto);
  }

  @Patch('config/proveedor/:id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Actualizar proveedor e-CF' })
  updateProveedor(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateProveedorECFDto,
  ) {
    return this.ecfService.updateProveedor(id, dto);
  }
}
