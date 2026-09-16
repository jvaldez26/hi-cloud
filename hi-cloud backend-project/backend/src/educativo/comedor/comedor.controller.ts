import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards, ParseIntPipe } from '@nestjs/common';
import { ComedorService } from './comedor.service';
import { CreatePlanComedorDto, UpdatePlanComedorDto } from './dto/comedor.dto';
import { JwtAuthGuard }     from '../../auth/guards/jwt-auth.guard';
import { RolesGuard }       from '../../auth/guards/roles.guard';
import { TenantGuard }      from '../../tenant/tenant.guard';
import { ModuloAddonGuard } from '../../modulos-addon/guards/modulo-addon.guard';
import { TenantService }    from '../../tenant/tenant.service';

@UseGuards(JwtAuthGuard, RolesGuard, TenantGuard, ModuloAddonGuard('educativo'))
@Controller('educativo/comedor')
export class ComedorController {
  constructor(
    private readonly svc: ComedorService,
    private readonly tenantSvc: TenantService,
  ) {}

  private get empresaId() { return this.tenantSvc.getEmpresaId(); }

  @Get('planes')
  listPlanes(@Query('estudianteId') estudianteId?: string, @Query('isActive') isActive?: string) {
    return this.svc.listPlanes(this.empresaId, {
      estudianteId: estudianteId ? Number(estudianteId) : undefined,
      isActive: isActive !== undefined ? isActive === 'true' : undefined,
    });
  }

  @Post('planes')
  createPlan(@Body() dto: CreatePlanComedorDto) {
    return this.svc.createPlan(this.empresaId, dto);
  }

  @Patch('planes/:id')
  updatePlan(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdatePlanComedorDto) {
    return this.svc.updatePlan(this.empresaId, id, dto);
  }

  @Post('planes/:id/dar-de-baja')
  darDeBaja(@Param('id', ParseIntPipe) id: number) {
    return this.svc.darDeBaja(this.empresaId, id);
  }
}
