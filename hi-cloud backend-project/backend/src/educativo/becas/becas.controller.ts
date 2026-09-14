import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards, ParseIntPipe } from '@nestjs/common';
import { BecasService } from './becas.service';
import { CreateBecaDto, UpdateBecaDto, AsignarBecaDto, UpdateAsignacionBecaDto } from './dto/becas.dto';
import { JwtAuthGuard }     from '../../auth/guards/jwt-auth.guard';
import { RolesGuard }       from '../../auth/guards/roles.guard';
import { TenantGuard }      from '../../tenant/tenant.guard';
import { ModuloAddonGuard } from '../../modulos-addon/guards/modulo-addon.guard';
import { TenantService }    from '../../tenant/tenant.service';

@UseGuards(JwtAuthGuard, RolesGuard, TenantGuard, ModuloAddonGuard('educativo'))
@Controller('educativo/becas')
export class BecasController {
  constructor(
    private readonly svc: BecasService,
    private readonly tenantSvc: TenantService,
  ) {}

  // ── Catálogo ────────────────────────────────────────────────────────────────

  @Get()
  listBecas(@Query('isActive') isActive?: string) {
    return this.svc.listBecas(
      this.tenantSvc.getEmpresaId(),
      isActive !== undefined ? isActive === 'true' : undefined,
    );
  }

  @Post()
  createBeca(@Body() dto: CreateBecaDto) {
    return this.svc.createBeca(this.tenantSvc.getEmpresaId(), dto);
  }

  @Patch(':id')
  updateBeca(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateBecaDto) {
    return this.svc.updateBeca(this.tenantSvc.getEmpresaId(), id, dto);
  }

  // ── Asignaciones ──────────────────────────────────────────────────────────

  @Get('asignaciones')
  listAsignaciones(
    @Query('estudianteId') estudianteId?: string,
    @Query('anioEscolarId') anioEscolarId?: string,
  ) {
    return this.svc.listAsignaciones(this.tenantSvc.getEmpresaId(), {
      estudianteId:  estudianteId  ? Number(estudianteId)  : undefined,
      anioEscolarId: anioEscolarId ? Number(anioEscolarId) : undefined,
    });
  }

  @Post('asignaciones')
  asignarBeca(@Body() dto: AsignarBecaDto) {
    return this.svc.asignarBeca(this.tenantSvc.getEmpresaId(), dto);
  }

  @Patch('asignaciones/:id')
  updateAsignacion(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateAsignacionBecaDto) {
    return this.svc.updateAsignacion(this.tenantSvc.getEmpresaId(), id, dto);
  }
}
