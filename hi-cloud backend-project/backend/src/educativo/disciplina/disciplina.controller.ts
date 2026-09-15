import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards, ParseIntPipe } from '@nestjs/common';
import { DisciplinaService } from './disciplina.service';
import { CreateDisciplinaDto, UpdateDisciplinaDto, FiltrosDisciplinaDto } from './dto/disciplina.dto';
import { JwtAuthGuard }     from '../../auth/guards/jwt-auth.guard';
import { RolesGuard }       from '../../auth/guards/roles.guard';
import { TenantGuard }      from '../../tenant/tenant.guard';
import { ModuloAddonGuard } from '../../modulos-addon/guards/modulo-addon.guard';
import { TenantService }    from '../../tenant/tenant.service';
import { GetUser }          from '../../auth/decorators/get-user.decorator';

@UseGuards(JwtAuthGuard, RolesGuard, TenantGuard, ModuloAddonGuard('educativo'))
@Controller('educativo/disciplina')
export class DisciplinaController {
  constructor(
    private readonly svc: DisciplinaService,
    private readonly tenantSvc: TenantService,
  ) {}

  private get empresaId() { return this.tenantSvc.getEmpresaId(); }

  @Get()
  list(@Query() filtros: FiltrosDisciplinaDto, @GetUser('id') usuarioId: number) {
    return this.svc.list(this.empresaId, usuarioId, filtros);
  }

  @Get('estudiante/:estudianteId')
  expediente(@Param('estudianteId', ParseIntPipe) estudianteId: number, @GetUser('id') usuarioId: number) {
    return this.svc.expedienteEstudiante(this.empresaId, usuarioId, estudianteId);
  }

  @Post()
  create(@Body() dto: CreateDisciplinaDto, @GetUser('id') usuarioId: number) {
    return this.svc.create(this.empresaId, usuarioId, dto);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateDisciplinaDto,
    @GetUser('id') usuarioId: number,
  ) {
    return this.svc.update(this.empresaId, usuarioId, id, dto);
  }

  @Post(':id/notificar-padres')
  notificarPadres(@Param('id', ParseIntPipe) id: number, @GetUser('id') usuarioId: number) {
    return this.svc.notificarPadres(this.empresaId, usuarioId, id);
  }
}
