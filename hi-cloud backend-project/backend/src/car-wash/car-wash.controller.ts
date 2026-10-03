import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards, UseInterceptors, UploadedFiles } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../tenant/tenant.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { ModuloAddonGuard } from '../modulos-addon/guards/modulo-addon.guard';
import { TenantService } from '../tenant/tenant.service';
import { UserRole } from '../users/enums/user-role.enum';
import { User } from '../users/users.entity';
import { CwConfigService } from './services/cw-config.service';
import { CwServiciosService } from './services/cw-servicios.service';
import { CwTurnosService } from './services/cw-turnos.service';
import { CwTurnoFotosService, MAX_FOTOS_POR_TURNO, MAX_BYTES_POR_FOTO, type ArchivoSubido } from './services/cw-turno-fotos.service';
import { CwDashboardService } from './services/cw-dashboard.service';
import { ActualizarConfigDto } from './dto/config.dto';
import { CrearServicioDto, ActualizarServicioDto } from './dto/servicio.dto';
import { CrearTurnoDto, CambiarEstadoTurnoDto, AsignarBahiaDto, EditarTurnoDto } from './dto/turno.dto';
import { AsignarLavadoresDto } from './dto/turno-lavadores.dto';
import { FiltrosHistorialTurnoDto } from './dto/filtros-historial.dto';

const ROLES_OPERATIVOS = [UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR];

@Controller('car-wash')
@UseGuards(JwtAuthGuard, TenantGuard, ModuloAddonGuard('car_wash'), RolesGuard)
@ApiTags('Car Wash')
@ApiBearerAuth()
export class CarWashController {
  constructor(
    private readonly tenantSvc: TenantService,
    private readonly configSvc: CwConfigService,
    private readonly serviciosSvc: CwServiciosService,
    private readonly turnosSvc: CwTurnosService,
    private readonly fotosSvc: CwTurnoFotosService,
    private readonly dashboardSvc: CwDashboardService,
  ) {}

  private get empresaId() { return this.tenantSvc.getEmpresaId(); }
  private async sucursalId(dtoSucursalId?: number) {
    return (await this.tenantSvc.resolveSucursalId(dtoSucursalId)) ?? this.tenantSvc.getSucursalId() ?? 0;
  }

  @Get('dashboard')
  @Roles(...ROLES_OPERATIVOS)
  async dashboard() {
    return this.dashboardSvc.resumen(this.empresaId, await this.sucursalId());
  }

  // ── Config (solo ADMIN) ──────────────────────────────────────────────────

  @Get('config')
  @Roles(UserRole.ADMIN)
  async getConfig() {
    return this.configSvc.obtener(this.empresaId, await this.sucursalId());
  }

  @Patch('config')
  @Roles(UserRole.ADMIN)
  async actualizarConfig(@Body() dto: ActualizarConfigDto) {
    return this.configSvc.actualizar(this.empresaId, await this.sucursalId(), dto);
  }

  // ── Catálogo de servicios (solo ADMIN) ───────────────────────────────────

  @Get('servicios')
  @Roles(UserRole.ADMIN, ...ROLES_OPERATIVOS)
  listarServicios() {
    return this.serviciosSvc.listar(this.empresaId);
  }

  @Post('servicios')
  @Roles(UserRole.ADMIN)
  crearServicio(@Body() dto: CrearServicioDto) {
    return this.serviciosSvc.crear(this.empresaId, dto);
  }

  @Patch('servicios/:id')
  @Roles(UserRole.ADMIN)
  actualizarServicio(@Param('id', ParseIntPipe) id: number, @Body() dto: ActualizarServicioDto) {
    return this.serviciosSvc.actualizar(this.empresaId, id, dto);
  }

  // ── Turnos (ADMIN, CONTADOR, VENDEDOR) ──────────────────────────────────

  @Get('turnos/tablero')
  @Roles(...ROLES_OPERATIVOS)
  async tablero() {
    return this.turnosSvc.listarTablero(this.empresaId, await this.sucursalId());
  }

  @Get('placas/:placa/historial')
  @Roles(...ROLES_OPERATIVOS)
  historialPorPlaca(@Param('placa') placa: string) {
    return this.turnosSvc.historialPorPlaca(this.empresaId, placa);
  }

  @Get('turnos')
  @Roles(...ROLES_OPERATIVOS)
  async historial(@Query() filtros: FiltrosHistorialTurnoDto) {
    return this.turnosSvc.listarHistorial(this.empresaId, await this.sucursalId(), filtros);
  }

  @Get('turnos/:id')
  @Roles(...ROLES_OPERATIVOS)
  obtenerTurno(@Param('id', ParseIntPipe) id: number) {
    return this.turnosSvc.obtener(this.empresaId, id);
  }

  @Post('turnos')
  @Roles(...ROLES_OPERATIVOS)
  async crearTurno(@Body() dto: CrearTurnoDto, @GetUser() usuario: User) {
    return this.turnosSvc.crear(this.empresaId, await this.sucursalId(dto.sucursalId), usuario.id, dto);
  }

  @Patch('turnos/:id/estado')
  @Roles(...ROLES_OPERATIVOS)
  async cambiarEstado(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CambiarEstadoTurnoDto,
    @GetUser() usuario: User & { role?: string },
  ) {
    const puedeForzar = usuario.role === UserRole.ADMIN;
    return this.turnosSvc.cambiarEstado(this.empresaId, id, dto, usuario.id, puedeForzar);
  }

  @Patch('turnos/:id')
  @Roles(...ROLES_OPERATIVOS)
  editarTurno(@Param('id', ParseIntPipe) id: number, @Body() dto: EditarTurnoDto) {
    return this.turnosSvc.editar(this.empresaId, id, dto);
  }

  @Patch('turnos/:id/bahia')
  @Roles(...ROLES_OPERATIVOS)
  asignarBahia(@Param('id', ParseIntPipe) id: number, @Body() dto: AsignarBahiaDto) {
    return this.turnosSvc.asignarBahia(this.empresaId, id, dto);
  }

  @Patch('turnos/:id/lavadores')
  @Roles(...ROLES_OPERATIVOS)
  asignarLavadores(@Param('id', ParseIntPipe) id: number, @Body() dto: AsignarLavadoresDto) {
    return this.turnosSvc.asignarLavadores(this.empresaId, id, dto);
  }

  @Get('turnos/:id/cobro')
  @Roles(...ROLES_OPERATIVOS)
  estadoCobro(@Param('id', ParseIntPipe) id: number) {
    return this.turnosSvc.estadoCobro(this.empresaId, id);
  }

  @Get('turnos/:id/detalles-cobro')
  @Roles(...ROLES_OPERATIVOS)
  detallesParaCobro(@Param('id', ParseIntPipe) id: number) {
    return this.turnosSvc.detallesParaCobro(this.empresaId, id);
  }

  // ── Fotos de daños previos ───────────────────────────────────────────────

  @Post('turnos/:id/fotos')
  @Roles(...ROLES_OPERATIVOS)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FilesInterceptor('fotos', MAX_FOTOS_POR_TURNO, {
    storage: memoryStorage(),
    limits: { fileSize: MAX_BYTES_POR_FOTO },
    fileFilter: (_req, file, cb) => {
      const permitidos = ['image/jpeg', 'image/png', 'image/webp'];
      if (!permitidos.includes(file.mimetype)) {
        return cb(new Error('Las fotos deben ser PNG, JPG o WEBP') as any, false);
      }
      cb(null, true);
    },
  }))
  async subirFotos(@Param('id', ParseIntPipe) id: number, @UploadedFiles() fotos?: ArchivoSubido[]) {
    await this.turnosSvc.obtener(this.empresaId, id); // 404 si el turno no existe o no es de esta empresa
    const guardadas = await this.fotosSvc.procesarYGuardar(id, this.empresaId, fotos ?? []);
    return this.fotosSvc.conUrlFirmada(guardadas);
  }

  @Get('turnos/:id/fotos')
  @Roles(...ROLES_OPERATIVOS)
  async listarFotos(@Param('id', ParseIntPipe) id: number) {
    const fotos = await this.fotosSvc.porTurno(this.empresaId, id);
    return this.fotosSvc.conUrlFirmada(fotos);
  }
}
