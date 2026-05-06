import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ConfiguracionService } from './configuracion.service';
import { UpdateEmpresaDto } from './dto/update-empresa.dto';
import { UpdateConfiguracionDto } from './dto/update-configuracion.dto';
import { CreateSucursalDto } from './dto/create-sucursal.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/enums/user-role.enum';

@ApiTags('Configuración del Sistema')
@Controller('configuracion')
export class ConfiguracionController {
  constructor(private configuracionService: ConfiguracionService) {}

  // ── Público — no requiere autenticación ────────────────────────────────────

  @Get('info')
  @ApiOperation({ summary: 'Información pública del sistema (nombre, empresa, versión)' })
  getInfoPublica() {
    return this.configuracionService.getInfoPublica();
  }

  // ── Rutas protegidas ───────────────────────────────────────────────────────

  @Get('panel')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Panel completo: empresa + parámetros + sucursales (solo ADMIN)' })
  getPanelCompleto() {
    return this.configuracionService.getPanelCompleto();
  }

  // ── Empresa ────────────────────────────────────────────────────────────────

  @Get('empresa')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Datos de la empresa (nombre, RNC, dirección, logo)' })
  getEmpresa() {
    return this.configuracionService.getEmpresa();
  }

  @Patch('empresa')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Actualizar datos de la empresa (solo ADMIN)' })
  updateEmpresa(@Body() dto: UpdateEmpresaDto) {
    return this.configuracionService.updateEmpresa(dto);
  }

  // ── Configuraciones del sistema ────────────────────────────────────────────

  @Get('sistema')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Todos los parámetros del sistema agrupados por categoría' })
  getConfiguraciones() {
    return this.configuracionService.getConfiguraciones();
  }

  @Get('sistema/grupo/:grupo')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Parámetros de un grupo específico (fiscal, nomina, ecf, etc.)' })
  getByGrupo(@Param('grupo') grupo: string) {
    return this.configuracionService.getConfiguracionesByGrupo(grupo);
  }

  @Patch('sistema/:clave')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Actualizar valor de un parámetro del sistema (solo ADMIN, si es editable)' })
  updateConfiguracion(
    @Param('clave') clave: string,
    @Body() dto: UpdateConfiguracionDto,
  ) {
    return this.configuracionService.updateConfiguracion(clave, dto);
  }

  // ── Sucursales ─────────────────────────────────────────────────────────────

  @Get('sucursales')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Listar sucursales de la empresa' })
  getSucursales() {
    return this.configuracionService.getSucursales();
  }

  @Post('sucursales')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Crear nueva sucursal (solo ADMIN)' })
  createSucursal(@Body() dto: CreateSucursalDto) {
    return this.configuracionService.createSucursal(dto);
  }

  @Patch('sucursales/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Actualizar sucursal (solo ADMIN)' })
  updateSucursal(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: Partial<CreateSucursalDto>,
  ) {
    return this.configuracionService.updateSucursal(id, dto);
  }
}
