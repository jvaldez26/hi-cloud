import {
  Controller, Get, Query, UseGuards, DefaultValuePipe, ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../tenant/tenant.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { ModuloAddonGuard } from '../modulos-addon/guards/modulo-addon.guard';
import { RestauranteService } from '../restaurante/restaurante.service';
import { TallerService } from '../taller/taller.service';
import { OpticaService } from '../optica/optica.service';

@ApiTags('POS Contexto')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR)
@Controller('pos/contexto')
export class PosContextoController {
  constructor(
    private readonly restauranteSvc: RestauranteService,
    private readonly tallerSvc: TallerService,
    private readonly opticaSvc: OpticaService,
  ) {}

  // ── RESTAURANTE ───────────────────────────────────────────────────────────
  @Get('restaurante/mesas')
  @UseGuards(ModuloAddonGuard('restaurante'))
  @ApiOperation({ summary: 'Mapa de mesas para el POS en modo Restaurante' })
  mesasRestaurante() {
    return this.restauranteSvc.mapaMesas();
  }

  // ── TALLER ────────────────────────────────────────────────────────────────
  @Get('taller/ordenes')
  @UseGuards(ModuloAddonGuard('taller'))
  @ApiOperation({ summary: 'Órdenes de servicio listas para cobrar en el POS' })
  ordenesTaller(
    @Query('page',  new DefaultValuePipe(1),  ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('estado') estado = 'para_cobrar',
    @Query('search') search?: string,
  ) {
    return this.tallerSvc.listarOrdenes(page, limit, estado, undefined, undefined, undefined, undefined, search);
  }

  // ── ÓPTICA ────────────────────────────────────────────────────────────────
  @Get('optica/ordenes')
  @UseGuards(ModuloAddonGuard('optica'))
  @ApiOperation({ summary: 'Órdenes de trabajo listas para cobrar en el POS' })
  ordenesOptica(
    @Query('page',  new DefaultValuePipe(1),  ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('estado') estado = 'entregada',
  ) {
    return this.opticaSvc.listarOrdenesTrabajo(page, limit, estado);
  }
}
