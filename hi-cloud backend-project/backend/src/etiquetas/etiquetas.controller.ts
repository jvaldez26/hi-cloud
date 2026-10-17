import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiHeader } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike } from 'typeorm';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { Producto } from '../productos/entities/producto.entity';
import { TenantService } from '../tenant/tenant.service';

@ApiTags('Etiquetas de Inventario')
@ApiBearerAuth('access-token')
@ApiHeader({ name: 'X-Empresa-ID', description: 'ID de la empresa activa', required: true })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR, UserRole.VIEWER)
@Controller('etiquetas')
export class EtiquetasController {
  constructor(
    @InjectRepository(Producto)
    private productoRepo: Repository<Producto>,
    private tenantSvc: TenantService,
  ) {}

  @Get('productos')
  @ApiOperation({ summary: 'Buscar productos para generación de etiquetas' })
  async buscarProductos(@Query('q') q?: string, @Query('categoriaId') categoriaId?: string) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const base: any = { empresaId, isActive: true };
    if (categoriaId) base.categoriaId = Number(categoriaId);

    const where = q
      ? [
          { ...base, nombre: ILike(`%${q}%`) },
          { ...base, codigo: ILike(`%${q}%`) },
        ]
      : base;

    const productos = await this.productoRepo.find({
      where,
      select: ['id', 'codigo', 'nombre', 'precio', 'porcentajeIva', 'unidadMedida', 'categoriaId', 'stock', 'imagenUrl'],
      order: { nombre: 'ASC' },
      take: 50, // búsqueda server-side: 50 resultados por término, el usuario escribe para filtrar
    });

    if (!productos.length) return productos;
    const nombresPorId = await this.nombresDeCategoria(empresaId, productos.map(p => p.categoriaId));
    return productos.map(p => ({ ...p, categoriaNombre: p.categoriaId != null ? (nombresPorId.get(p.categoriaId) ?? null) : null }));
  }

  @Get('categorias')
  @ApiOperation({ summary: 'Lista de categorías de productos para filtro en etiquetas' })
  async getCategorias() {
    const empresaId = this.tenantSvc.getEmpresaId();
    return this.productoRepo.manager.query<{ id: number; nombre: string }[]>(
      `SELECT id, nombre FROM categorias_productos WHERE "empresaId" = $1 AND "isActive" = true ORDER BY nombre ASC`,
      [empresaId],
    );
  }

  /** Mismo patrón de lookup por lote que productos.service.ts::catalogoPos — sin
   *  inyectar CategoriasProductoService para no acoplar este módulo chico al de Productos. */
  private async nombresDeCategoria(empresaId: number, ids: (number | null | undefined)[]): Promise<Map<number, string>> {
    const unicos = [...new Set(ids.filter((id): id is number => id != null))];
    if (!unicos.length) return new Map();
    const filas = await this.productoRepo.manager.query<{ id: number; nombre: string }[]>(
      `SELECT id, nombre FROM categorias_productos WHERE "empresaId" = $1 AND id = ANY($2)`,
      [empresaId, unicos],
    );
    return new Map(filas.map(f => [f.id, f.nombre]));
  }
}
