import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards, ParseIntPipe } from '@nestjs/common';
import { BibliotecaService } from './biblioteca.service';
import { CreateLibroDto, UpdateLibroDto, CreatePrestamoDto, FiltrosPrestamoDto } from './dto/biblioteca.dto';
import { JwtAuthGuard }     from '../../auth/guards/jwt-auth.guard';
import { RolesGuard }       from '../../auth/guards/roles.guard';
import { TenantGuard }      from '../../tenant/tenant.guard';
import { ModuloAddonGuard } from '../../modulos-addon/guards/modulo-addon.guard';
import { TenantService }    from '../../tenant/tenant.service';

@UseGuards(JwtAuthGuard, RolesGuard, TenantGuard, ModuloAddonGuard('educativo'))
@Controller('educativo/biblioteca')
export class BibliotecaController {
  constructor(
    private readonly svc: BibliotecaService,
    private readonly tenantSvc: TenantService,
  ) {}

  private get empresaId() { return this.tenantSvc.getEmpresaId(); }

  // ── Libros ──────────────────────────────────────────────────────────────

  @Get('libros')
  listLibros(@Query('q') q?: string, @Query('isActive') isActive?: string) {
    return this.svc.listLibros(this.empresaId, {
      q,
      isActive: isActive !== undefined ? isActive === 'true' : undefined,
    });
  }

  @Post('libros')
  createLibro(@Body() dto: CreateLibroDto) {
    return this.svc.createLibro(this.empresaId, dto);
  }

  @Patch('libros/:id')
  updateLibro(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateLibroDto) {
    return this.svc.updateLibro(this.empresaId, id, dto);
  }

  // ── Préstamos ───────────────────────────────────────────────────────────

  @Get('prestamos')
  listPrestamos(@Query() filtros: FiltrosPrestamoDto) {
    return this.svc.listPrestamos(this.empresaId, filtros);
  }

  @Get('prestamos/vencidos')
  listVencidos() {
    return this.svc.listVencidos(this.empresaId);
  }

  @Post('prestamos')
  prestar(@Body() dto: CreatePrestamoDto) {
    return this.svc.prestar(this.empresaId, dto);
  }

  @Post('prestamos/:id/devolver')
  devolver(@Param('id', ParseIntPipe) id: number) {
    return this.svc.devolver(this.empresaId, id);
  }
}
