import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards, ParseIntPipe } from '@nestjs/common';
import { ComunicadosService } from './comunicados.service';
import { CreateComunicadoDto, UpdateComunicadoDto, FiltrosComunicadoDto } from './dto/comunicados.dto';
import { JwtAuthGuard }     from '../../auth/guards/jwt-auth.guard';
import { RolesGuard }       from '../../auth/guards/roles.guard';
import { TenantGuard }      from '../../tenant/tenant.guard';
import { ModuloAddonGuard } from '../../modulos-addon/guards/modulo-addon.guard';
import { TenantService }    from '../../tenant/tenant.service';
import { GetUser }          from '../../auth/decorators/get-user.decorator';

@UseGuards(JwtAuthGuard, RolesGuard, TenantGuard, ModuloAddonGuard('educativo'))
@Controller('educativo/comunicados')
export class ComunicadosController {
  constructor(
    private readonly svc: ComunicadosService,
    private readonly tenantSvc: TenantService,
  ) {}

  private get empresaId() { return this.tenantSvc.getEmpresaId(); }

  @Get()
  list(@Query() filtros: FiltrosComunicadoDto) {
    return this.svc.list(this.empresaId, filtros);
  }

  @Post()
  create(@Body() dto: CreateComunicadoDto, @GetUser('nombre') nombre: string) {
    return this.svc.create(this.empresaId, nombre, dto);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateComunicadoDto) {
    return this.svc.update(this.empresaId, id, dto);
  }
}
