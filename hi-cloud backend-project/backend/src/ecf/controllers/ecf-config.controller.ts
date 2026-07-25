import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, ParseIntPipe,
  UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { SuperAdminGuard } from '../../super-admin/super-admin.guard';
import { EcfConfigService } from '../services/ecf-config.service';
import { CreateEmpresaEcfConfigDto } from '../dto/create-empresa-ecf-config.dto';
import { UpdateEmpresaEcfConfigDto } from '../dto/update-empresa-ecf-config.dto';
import { CreateSecuenciaAdminDto } from '../dto/create-secuencia-admin.dto';
import { GetUser } from '../../auth/decorators/get-user.decorator';
import { User } from '../../users/users.entity';

/**
 * Endpoints de configuración e-CF — accesibles SOLO para SUPER_ADMIN.
 * Gestionan credenciales MSeller por empresa y rangos de eNCF autorizados.
 */
@ApiTags('Super Admin — Configuración e-CF')
@ApiBearerAuth('access-token')
@UseGuards(SuperAdminGuard)
@Controller('admin/ecf-config')
export class EcfConfigController {
  constructor(private svc: EcfConfigService) {}

  // ── Dashboard global ──────────────────────────────────────────────────────

  @Get('dashboard')
  @ApiOperation({ summary: 'Dashboard global e-CF: totales, aceptados, errores por empresa' })
  getDashboard() {
    return this.svc.dashboardGlobal();
  }

  // ── CRUD EmpresaEcfConfig ─────────────────────────────────────────────────

  @Get('empresas')
  @ApiOperation({ summary: 'Listar todas las configuraciones e-CF (sin credenciales en texto claro)' })
  listar() {
    return this.svc.listar();
  }

  @Get('empresas/:empresaId')
  @ApiOperation({ summary: 'Obtener configuración e-CF de una empresa (sin credenciales)' })
  obtener(@Param('empresaId', ParseIntPipe) empresaId: number) {
    return this.svc.obtenerPorEmpresaSanitizado(empresaId);
  }

  @Post('empresas')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Crear configuración e-CF para una empresa (cifra credenciales)' })
  crear(@Body() dto: CreateEmpresaEcfConfigDto) {
    return this.svc.crear(dto);
  }

  @Patch('empresas/:empresaId')
  @ApiOperation({ summary: 'Actualizar configuración e-CF de una empresa' })
  actualizar(
    @Param('empresaId', ParseIntPipe) empresaId: number,
    @Body() dto: UpdateEmpresaEcfConfigDto,
  ) {
    return this.svc.actualizar(empresaId, dto);
  }

  @Delete('empresas/:empresaId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar configuración e-CF de una empresa' })
  eliminar(@Param('empresaId', ParseIntPipe) empresaId: number) {
    return this.svc.eliminar(empresaId);
  }

  // ── Test de conexión MSeller ──────────────────────────────────────────────

  @Post('empresas/:empresaId/test-conexion')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Probar credenciales MSeller — verifica email/password/apiKey contra la API',
  })
  testConexion(@Param('empresaId', ParseIntPipe) empresaId: number) {
    return this.svc.probarConexion(empresaId);
  }

  // ── Gestión de secuencias eNCF (rangos autorizados por DGII) ─────────────

  @Get('empresas/:empresaId/secuencias')
  @ApiOperation({ summary: 'Listar secuencias eNCF de una empresa' })
  listarSecuencias(@Param('empresaId', ParseIntPipe) empresaId: number) {
    return this.svc.listarSecuencias(empresaId);
  }

  @Post('secuencias')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Cargar rango eNCF autorizado por DGII — valida solapamiento y activa la secuencia',
  })
  crearSecuencia(
    @Body() dto: CreateSecuenciaAdminDto,
    @GetUser() usuario: User,
  ) {
    // SuperAdminGuard inyecta req.user = { ...payload, id: payload.sub }
    // así la secuencia queda auditada con el ID real del Super Admin que la cargó
    return this.svc.crearSecuencia(dto, usuario.id);
  }

  @Patch('secuencias/:id/desactivar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Desactivar una secuencia eNCF' })
  desactivarSecuencia(@Param('id', ParseIntPipe) id: number) {
    return this.svc.desactivarSecuencia(id);
  }
}
