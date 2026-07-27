import { Controller, Get, Post, Patch, Body, Param, ParseIntPipe, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard }     from '../../auth/guards/jwt-auth.guard';
import { RolesGuard }       from '../../auth/guards/roles.guard';
import { TenantGuard }      from '../../tenant/tenant.guard';
import { Roles }            from '../../auth/decorators/roles.decorator';
import { UserRole }         from '../../users/enums/user-role.enum';
import { ModuloAddonGuard } from '../../modulos-addon/guards/modulo-addon.guard';
import { TenantService }    from '../../tenant/tenant.service';
import { EstructuraService } from './estructura.service';

@UseGuards(JwtAuthGuard, RolesGuard, TenantGuard, ModuloAddonGuard('educativo'))
@Controller('educativo')
export class EstructuraController {
  constructor(
    private readonly svc: EstructuraService,
    private readonly tenantSvc: TenantService,
  ) {}

  private get empresaId() { return this.tenantSvc.getEmpresaId(); }

  // ── Niveles ─────────────────────────────────────────────────────────────

  @Get('niveles')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR, UserRole.VIEWER)
  listNiveles() { return this.svc.listNiveles(this.empresaId); }

  @Post('niveles')
  @Roles(UserRole.ADMIN)
  createNivel(@Body() body: any) { return this.svc.createNivel(this.empresaId, body); }

  @Patch('niveles/:id')
  @Roles(UserRole.ADMIN)
  updateNivel(@Param('id', ParseIntPipe) id: number, @Body() body: any) {
    return this.svc.updateNivel(this.empresaId, id, body);
  }

  // ── Grados ──────────────────────────────────────────────────────────────

  @Get('grados')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR, UserRole.VIEWER)
  listGrados(@Query('nivelId') nivelId?: string) {
    return this.svc.listGrados(this.empresaId, nivelId ? +nivelId : undefined);
  }

  @Post('grados')
  @Roles(UserRole.ADMIN)
  createGrado(@Body() body: any) { return this.svc.createGrado(this.empresaId, body); }

  @Patch('grados/:id')
  @Roles(UserRole.ADMIN)
  updateGrado(@Param('id', ParseIntPipe) id: number, @Body() body: any) {
    return this.svc.updateGrado(this.empresaId, id, body);
  }

  @Post('grados/:id/pensum')
  @Roles(UserRole.ADMIN)
  setPensum(@Param('id', ParseIntPipe) id: number, @Body() body: any) {
    return this.svc.setPensum(this.empresaId, id, body.asignaturas ?? []);
  }

  @Get('grados/:id/pensum')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR, UserRole.VIEWER)
  getPensum(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getPensum(this.empresaId, id);
  }

  // ── Secciones ───────────────────────────────────────────────────────────

  @Get('secciones')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR, UserRole.VIEWER)
  listSecciones(@Query('gradoId') gradoId?: string, @Query('anioEscolarId') anioId?: string) {
    return this.svc.listSecciones(this.empresaId, gradoId ? +gradoId : undefined, anioId ? +anioId : undefined);
  }

  @Post('secciones')
  @Roles(UserRole.ADMIN)
  createSeccion(@Body() body: any) { return this.svc.createSeccion(this.empresaId, body); }

  @Patch('secciones/:id')
  @Roles(UserRole.ADMIN)
  updateSeccion(@Param('id', ParseIntPipe) id: number, @Body() body: any) {
    return this.svc.updateSeccion(this.empresaId, id, body);
  }

  // ── Asignaturas ─────────────────────────────────────────────────────────

  @Get('asignaturas')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR, UserRole.VIEWER)
  listAsignaturas() { return this.svc.listAsignaturas(this.empresaId); }

  @Post('asignaturas')
  @Roles(UserRole.ADMIN)
  createAsignatura(@Body() body: any) { return this.svc.createAsignatura(this.empresaId, body); }

  @Patch('asignaturas/:id')
  @Roles(UserRole.ADMIN)
  updateAsignatura(@Param('id', ParseIntPipe) id: number, @Body() body: any) {
    return this.svc.updateAsignatura(this.empresaId, id, body);
  }
}
