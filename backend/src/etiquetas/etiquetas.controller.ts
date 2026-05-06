import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiHeader } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like } from 'typeorm';
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
  async buscarProductos(@Query('q') q?: string, @Query('categoria') categoria?: string) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const where: any = { empresaId, isActive: true };
    if (q)          where.nombre    = Like(`%${q}%`);
    if (categoria)  where.categoria = categoria;

    const productos = await this.productoRepo.find({
      where,
      select: ['id', 'codigo', 'nombre', 'precio', 'porcentajeIva', 'unidadMedida', 'categoria', 'stock', 'imagenUrl'],
      order: { nombre: 'ASC' },
      take: 100,
    });

    return productos;
  }

  @Get('categorias')
  @ApiOperation({ summary: 'Lista de categorías de productos para filtro en etiquetas' })
  async getCategorias() {
    const empresaId = this.tenantSvc.getEmpresaId();
    const raw = await this.productoRepo
      .createQueryBuilder('p')
      .select('DISTINCT p.categoria', 'categoria')
      .where('p.empresaId = :eid', { eid: empresaId })
      .andWhere('p.isActive = :a',  { a: true })
      .andWhere('p.categoria IS NOT NULL')
      .orderBy('p.categoria', 'ASC')
      .getRawMany<{ categoria: string }>();

    return raw.map(r => r.categoria).filter(Boolean);
  }
}
