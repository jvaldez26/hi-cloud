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
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ConfiguracionService } from './configuracion.service';
import { UpdateEmpresaDto } from './dto/update-empresa.dto';
import { UpdateConfiguracionDto } from './dto/update-configuracion.dto';
import { CreateSucursalDto } from './dto/create-sucursal.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { User } from '../users/users.entity';

const IMAGE_FILTER = (_: any, file: { buffer: Buffer; mimetype: string; originalname: string; size: number }, cb: any) => {
  if (/^image\/(jpeg|png|svg\+xml|gif|webp|x-icon)$/.test(file.mimetype)) cb(null, true);
  else cb(new BadRequestException('Solo imágenes: JPG, PNG, SVG, GIF, WEBP, ICO'), false);
};

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

  @Get('empresa/verificar-rnc/:rnc')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Verifica si un RNC está disponible y si tiene advertencias e-CF' })
  verificarRNC(@Param('rnc') rnc: string) {
    return this.configuracionService.verificarRNC(rnc);
  }

  @Patch('empresa')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Actualizar datos de la empresa (solo ADMIN)' })
  updateEmpresa(@Body() dto: UpdateEmpresaDto) {
    return this.configuracionService.updateEmpresa(dto);
  }

  @Get('empresa/pos-config')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Obtener configuración del POS (modo supervisor, descuentos)' })
  getPosConfig() { return this.configuracionService.getPosConfig(); }

  @Patch('empresa/pos-config')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Actualizar configuración del POS (solo ADMIN)' })
  updatePosConfig(@Body() body: { supervisorModeEnabled: boolean; maxDiscountPercent: number }) {
    return this.configuracionService.updatePosConfig(body);
  }

  @Patch('empresa/control-caja')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Activar/desactivar control de caja por turno (solo ADMIN)' })
  updateControlCaja(
    @Body() body: { controlCajaActivo: boolean },
    @GetUser() user: User,
  ) {
    if (typeof body.controlCajaActivo !== 'boolean') {
      throw new BadRequestException('controlCajaActivo debe ser boolean');
    }
    return this.configuracionService.updateControlCaja(
      body.controlCajaActivo,
      user.id,
      user.nombre ?? user.email,
    );
  }

  @Post('empresa/upload-logo')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Subir logo de la empresa (máx 2MB)' })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 2 * 1024 * 1024 }, fileFilter: IMAGE_FILTER }))
  async uploadLogo(@UploadedFile() file: { buffer: Buffer; mimetype: string; originalname: string; size: number }) {
    if (!file) throw new BadRequestException('Archivo requerido');
    const empresaId = (await this.configuracionService.getEmpresa()).id;
    const url = await this.configuracionService.uploadLogo(empresaId, file.buffer, file.mimetype);
    return { url };
  }

  @Post('empresa/upload-favicon')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Subir favicon de la empresa (máx 512KB)' })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 512 * 1024 }, fileFilter: IMAGE_FILTER }))
  async uploadFavicon(@UploadedFile() file: { buffer: Buffer; mimetype: string; originalname: string; size: number }) {
    if (!file) throw new BadRequestException('Archivo requerido');
    const empresaId = (await this.configuracionService.getEmpresa()).id;
    const url = await this.configuracionService.uploadFavicon(empresaId, file.buffer, file.mimetype);
    return { url };
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
