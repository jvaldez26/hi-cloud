import {
  Controller, Get, Post, Patch, Body, Param, Query, Res,
  UseGuards, HttpCode, HttpStatus, ParseIntPipe, BadRequestException,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { IsIn, IsString, MaxLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { User } from '../users/users.entity';
import { SupervisorTarjetasService } from './supervisor-tarjetas.service';
import { TarjetaPdfService } from './tarjeta-pdf.service';
import type { NivelTarjetaSupervisor } from './entities/supervisor-tarjeta-config.entity';

class ActualizarNivelDto {
  @IsIn(['solo_tarjeta', 'tarjeta_pin'], { message: 'Nivel inválido' })
  nivel!: NivelTarjetaSupervisor;
}

class RevocarTarjetaDto {
  @IsString() @MaxLength(300)
  motivo?: string;
}

function empresaDe(u: User): number { return (u as any).empresaId; }
function sucursalDe(u: User): number | null { return (u as any).sucursalId ?? null; }

@ApiTags('supervisor-tarjetas')
@Controller('supervisor-tarjetas')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('access-token')
export class SupervisorTarjetasController {
  constructor(
    private readonly tarjetasSvc: SupervisorTarjetasService,
    private readonly pdfSvc: TarjetaPdfService,
  ) {}

  @Get('mi-tarjeta')
  @ApiOperation({ summary: 'Estado de la tarjeta de supervisor de la persona autenticada (Mi Perfil)' })
  async miTarjeta(@GetUser() usuario: User) {
    return this.tarjetasSvc.miTarjeta(empresaDe(usuario), usuario.id);
  }

  @Post('generar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Genera (o regenera) la propia tarjeta de supervisor y devuelve el PDF — el código solo se ve esta vez' })
  async generarMiTarjeta(
    @GetUser() usuario: User,
    @Query('formato') formato: string | undefined,
    @Res() res: Response,
  ) {
    await this.emitirYEnviarPdf(usuario.id, empresaDe(usuario), sucursalDe(usuario), usuario.id, formato, res);
  }

  @Post('revocar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoca la propia tarjeta de supervisor' })
  async revocarMiTarjeta(@Body() body: RevocarTarjetaDto, @GetUser() usuario: User) {
    return this.tarjetasSvc.revocarTarjeta(
      empresaDe(usuario), usuario.id, usuario.id,
      body.motivo?.trim() || 'Revocada por el propio titular',
    );
  }

  @Get('equipo')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Estado de tarjeta de cada miembro elegible a supervisor (Usuarios y Roles)' })
  async listarEquipo(@GetUser() usuario: User) {
    return this.tarjetasSvc.listarEquipo(empresaDe(usuario));
  }

  @Post('equipo/:userId/generar')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Genera (o regenera) la tarjeta de supervisor de un miembro del equipo — ADMIN' })
  async generarTarjetaEquipo(
    @Param('userId', ParseIntPipe) userId: number,
    @GetUser() admin: User,
    @Query('formato') formato: string | undefined,
    @Res() res: Response,
  ) {
    await this.emitirYEnviarPdf(userId, empresaDe(admin), sucursalDe(admin), admin.id, formato, res);
  }

  @Post('equipo/:userId/revocar')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Revoca la tarjeta de supervisor de un miembro del equipo — ADMIN' })
  async revocarTarjetaEquipo(
    @Param('userId', ParseIntPipe) userId: number,
    @Body() body: RevocarTarjetaDto,
    @GetUser() admin: User,
  ) {
    return this.tarjetasSvc.revocarTarjeta(
      empresaDe(admin), userId, admin.id,
      body.motivo?.trim() || 'Revocada por un administrador',
    );
  }

  @Get('nivel')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Nivel de seguridad de tarjeta de la empresa (Configuración → Modo Supervisor)' })
  async obtenerNivel(@GetUser() usuario: User) {
    return { nivel: await this.tarjetasSvc.obtenerNivel(empresaDe(usuario)) };
  }

  @Patch('nivel')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Cambia el nivel de seguridad de tarjeta de la empresa' })
  async actualizarNivel(@Body() body: ActualizarNivelDto, @GetUser() usuario: User) {
    return this.tarjetasSvc.actualizarNivel(empresaDe(usuario), body.nivel, usuario.id);
  }

  /**
   * El código solo existe en memoria durante esta petición: se genera, se usa
   * para armar el PDF y se descarta — nunca se devuelve como JSON ni queda en
   * ningún log de red. Si el stream falla a mitad de camino, la tarjeta ya
   * quedó activa en la BD (igual que un cambio de contraseña exitoso cuyo
   * email de confirmación no llega) — el titular puede volver a generarla si
   * no llegó a ver el PDF.
   */
  private async emitirYEnviarPdf(
    userId: number, empresaId: number, sucursalId: number | null, creadoPor: number,
    formato: string | undefined, res: Response,
  ) {
    const tarjeta = await this.tarjetasSvc.generarTarjeta(empresaId, userId, creadoPor);
    const { empresaNombre, sucursalNombre } = await this.tarjetasSvc.datosEmpresaYSucursal(empresaId, sucursalId);

    const datos = {
      nombre: tarjeta.nombre, role: tarjeta.role,
      empresaNombre, sucursalNombre,
      codigo: tarjeta.codigo, ultimosCuatro: tarjeta.ultimosCuatro,
      emitidaEn: new Date(),
    };

    const hoja = formato === 'hoja';
    const buffer = hoja ? await this.pdfSvc.generarPdfHoja(datos) : await this.pdfSvc.generarPdfTarjeta(datos);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="tarjeta-supervisor-${hoja ? 'hoja' : 'cr80'}.pdf"`);
    res.setHeader('Content-Length', buffer.length);
    res.end(buffer);
  }
}
