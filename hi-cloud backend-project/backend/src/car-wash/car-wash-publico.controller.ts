import { Controller, Get, NotFoundException, Param, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { DataSource } from 'typeorm';
import { CwTurnosService } from './services/cw-turnos.service';
import { CwPublicoThrottlerGuard } from './guards/cw-publico-throttler.guard';

/**
 * Sin login, sin cookies de sesión — modelo PortalController. Resuelve todo
 * por `token`, nunca por id. El mismo 404 para token inexistente o caducado
 * (no se distingue la razón, para no filtrar información del enlace).
 */
@ApiTags('Car Wash (Público)')
@Controller('publico/carwash')
export class CarWashPublicoController {
  constructor(
    private readonly turnosSvc: CwTurnosService,
    private readonly ds: DataSource,
  ) {}

  @Get(':token')
  @UseGuards(CwPublicoThrottlerGuard)
  @ApiOperation({ summary: 'Estado de un turno de Car Wash por su token público (PÚBLICO)' })
  async getPorToken(@Param('token') token: string) {
    const datos = await this.turnosSvc.obtenerPorTokenPublico(token);
    if (!datos) throw new NotFoundException('Enlace inválido o expirado');

    const [empresa] = await this.ds.query<{ nombre: string; logo: string | null }[]>(
      `SELECT COALESCE(NULLIF("nombreComercial", ''), nombre) AS nombre, logo
         FROM empresa WHERE id = $1 LIMIT 1`,
      [datos.negocioEmpresaId],
    );

    return {
      negocio: empresa ? { nombre: empresa.nombre, logo: empresa.logo ?? null } : null,
      codigo: datos.codigo,
      estado: datos.estado,
      lineaTiempo: datos.lineaTiempo,
      servicios: datos.servicios,
      posicionEnCola: datos.posicionEnCola,
      vehiculosDelante: datos.posicionEnCola,
      minutosEstimados: datos.minutosEstimados,
      placaEnmascarada: datos.placaEnmascarada,
    };
  }
}
