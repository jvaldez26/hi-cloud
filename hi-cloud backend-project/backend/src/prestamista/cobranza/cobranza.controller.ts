import { Controller, Get, Post, Patch, Body, Param, Query, ParseIntPipe, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../tenant/tenant.guard';
import { ModuloAddonGuard } from '../../modulos-addon/guards/modulo-addon.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../users/enums/user-role.enum';
import { TenantService } from '../../tenant/tenant.service';
import { GetUser } from '../../auth/decorators/get-user.decorator';
import { User } from '../../users/users.entity';
import { CobranzaService } from './cobranza.service';
import { RegistrarGestionDto, AsignarCobradorDto } from '../dto/prestamista.dto';

@Controller('prestamista/cobranza')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard, ModuloAddonGuard('prestamista'))
@ApiTags('Prestamista - Cobranza')
@ApiBearerAuth()
export class CobranzaController {
  constructor(private readonly svc: CobranzaService, private readonly tenantSvc: TenantService) {}
  private get empresaId() { return this.tenantSvc.getEmpresaId(); }

  @Get('cartera-vencida')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR, UserRole.VIEWER)
  carteraVencida(@Query() q: any) { return this.svc.carteraVencida(this.empresaId, q); }
  @Get('resumen')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR, UserRole.VIEWER)
  resumen() { return this.svc.resumenCobranza(this.empresaId); }
  @Get('cobradores')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR, UserRole.VIEWER)
  cobradores() { return this.svc.listarCobradores(this.empresaId); }
  @Get('prestamo/:prestamoId/gestiones')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR, UserRole.VIEWER)
  gestiones(@Param('prestamoId', ParseIntPipe) id: number) {
    return this.svc.gestionesByPrestamo(this.empresaId, id);
  }
  // Registrar gestión de cobro: operador básico o superior. El cobrador que
  // la hizo se toma SIEMPRE del usuario autenticado (no lo escribe la UI a
  // mano) — ver comentario en CobranzaService.registrarGestion.
  @Post('gestiones')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR)
  registrarGestion(@Body() body: RegistrarGestionDto, @GetUser() usuario: User) {
    return this.svc.registrarGestion(this.empresaId, body, { id: usuario.id, nombre: usuario.nombre });
  }

  @Post('prestamo/:prestamoId/notificar-mora')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  notificarMora(@Param('prestamoId', ParseIntPipe) id: number, @GetUser() usuario: User) {
    return this.svc.notificarMora(this.empresaId, id, { id: usuario.id, nombre: usuario.nombre });
  }

  @Get('prestamo/:prestamoId/whatsapp-mora')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR)
  whatsappMora(@Param('prestamoId', ParseIntPipe) id: number) {
    return this.svc.linkWhatsappMora(this.empresaId, id);
  }

  // Asignar/reasignar cartera a un cobrador — mismo nivel que editar
  // garantías/garantes (ADMIN+CONTADOR), un VENDEDOR gestiona pero no reparte cartera.
  @Patch('prestamo/:prestamoId/cobrador')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  asignarCobrador(@Param('prestamoId', ParseIntPipe) id: number, @Body() body: AsignarCobradorDto) {
    return this.svc.asignarCobrador(this.empresaId, id, body.cobradorId ?? null);
  }
}
