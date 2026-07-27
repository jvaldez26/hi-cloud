import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards, ParseIntPipe } from '@nestjs/common';
import { EstudiantesService } from './estudiantes.service';
import { JwtAuthGuard }     from '../../auth/guards/jwt-auth.guard';
import { RolesGuard }       from '../../auth/guards/roles.guard';
import { TenantGuard }      from '../../tenant/tenant.guard';
import { ModuloAddonGuard } from '../../modulos-addon/guards/modulo-addon.guard';
import { TenantService }    from '../../tenant/tenant.service';

@UseGuards(JwtAuthGuard, RolesGuard, TenantGuard, ModuloAddonGuard('educativo'))
@Controller('educativo/estudiantes')
export class EstudiantesController {
  constructor(
    private readonly svc: EstudiantesService,
    private readonly tenantSvc: TenantService,
  ) {}

  @Get()
  list(
    @Query('q') q?: string,
    @Query('gradoId') gradoId?: string,
    @Query('isActive') isActive?: string,
  ) {
    const eid = this.tenantSvc.getEmpresaId();
    return this.svc.list(
      eid,
      q,
      gradoId !== undefined ? Number(gradoId) : undefined,
      isActive !== undefined ? isActive === 'true' : undefined,
    );
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.svc.findOne(this.tenantSvc.getEmpresaId(), id);
  }

  @Post()
  create(@Body() dto: any) {
    return this.svc.create(this.tenantSvc.getEmpresaId(), dto);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: any) {
    return this.svc.update(this.tenantSvc.getEmpresaId(), id, dto);
  }

  @Post(':id/tutores')
  addTutor(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { tutorId: number; esPrincipal?: boolean },
  ) {
    return this.svc.addTutor(this.tenantSvc.getEmpresaId(), id, body.tutorId, body.esPrincipal ?? false);
  }

  @Delete(':id/tutores/:tutorId')
  removeTutor(
    @Param('id', ParseIntPipe) id: number,
    @Param('tutorId', ParseIntPipe) tutorId: number,
  ) {
    return this.svc.removeTutor(this.tenantSvc.getEmpresaId(), id, tutorId);
  }
}
