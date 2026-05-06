import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Producto } from '../productos/entities/producto.entity';
import { TenantService } from '../tenant/tenant.service';

export interface LineaValoracion {
  productoId:     number;
  codigo:         string;
  nombre:         string;
  categoria?:     string;
  stock:          number;
  costoPromedio:  number;
  valorTotal:     number;
  unidadMedida:   string;
}

@Injectable()
export class ValoracionStockService {
  constructor(
    @InjectRepository(Producto) private prodRepo: Repository<Producto>,
    private dataSource:  DataSource,
    private tenantSvc:   TenantService,
  ) {}

  // ─── Actualizar costo promedio (AVCO) al recibir mercancía ─────────────────
  // Fórmula AVCO:
  //   nuevo_costo_prom = (stock_actual × costo_prom_actual + cant_nueva × costo_nuevo)
  //                     / (stock_actual + cant_nueva)

  async actualizarCostoPromedio(
    productoId: number,
    cantidadNueva: number,
    costoUnitarioNuevo: number,
  ): Promise<void> {
    const prod = await this.prodRepo.findOne({ where: { id: productoId } });
    if (!prod) return;

    const stockActual      = Number(prod.stock ?? 0);
    const costoActual      = Number((prod as any).costoPromedio ?? 0);

    // Si no hay stock previo, el nuevo costo ES el costo promedio
    if (stockActual <= 0) {
      await this.prodRepo.update(productoId, { costoPromedio: costoUnitarioNuevo } as any);
      return;
    }

    const nuevoCostoPromedio = (
      (stockActual * costoActual) + (cantidadNueva * costoUnitarioNuevo)
    ) / (stockActual + cantidadNueva);

    await this.prodRepo.update(productoId, {
      costoPromedio: +nuevoCostoPromedio.toFixed(4),
    } as any);
  }

  // ─── Valoración completa del inventario ────────────────────────────────────

  async getValoracion(categoria?: string): Promise<{
    lineas:        LineaValoracion[];
    totales:       { cantidadProductos: number; valorTotal: number; valorPorCategoria: Record<string, number> };
    generadoEn:    string;
  }> {
    const empresaId = this.tenantSvc.getEmpresaId();
    const where: any = { empresaId, isActive: true };
    if (categoria) where.categoria = categoria;

    const productos = await this.prodRepo.find({ where, order: { categoria: 'ASC', nombre: 'ASC' } });

    const lineas: LineaValoracion[] = productos.map(p => {
      const stock          = Number(p.stock ?? 0);
      const costoPromedio  = Number((p as any).costoPromedio ?? 0);
      return {
        productoId:    p.id,
        codigo:        p.codigo,
        nombre:        p.nombre,
        categoria:     p.categoria,
        stock,
        costoPromedio,
        valorTotal:    +(stock * costoPromedio).toFixed(2),
        unidadMedida:  p.unidadMedida,
      };
    });

    const valorTotal = lineas.reduce((s, l) => s + l.valorTotal, 0);

    const valorPorCategoria: Record<string, number> = {};
    lineas.forEach(l => {
      const cat = l.categoria ?? 'Sin categoría';
      valorPorCategoria[cat] = +(( valorPorCategoria[cat] ?? 0) + l.valorTotal).toFixed(2);
    });

    return {
      lineas,
      totales: {
        cantidadProductos: lineas.length,
        valorTotal:        +valorTotal.toFixed(2),
        valorPorCategoria,
      },
      generadoEn: new Date().toISOString(),
    };
  }

  // ─── Historial de movimientos de costo ─────────────────────────────────────

  async historialCostos(productoId: number) {
    const empresaId = this.tenantSvc.getEmpresaId();

    const movs = await this.dataSource.query<{
      fecha: string; tipo: string; cantidad: string;
      costo: string; costoPromActualizado?: string; referencia: string;
    }[]>(`
      SELECT
        m."createdAt"::date::text    AS fecha,
        m.tipo,
        m.cantidad::text,
        p.precio::text               AS costo,
        p."costoPromedio"::text      AS "costoPromActualizado",
        COALESCE(m.referencia, '')   AS referencia
      FROM movimientos_inventario m
      JOIN productos p ON p.id = m."productoId"
      WHERE m."productoId" = $1
        AND p."empresaId"  = $2
        AND m."isActive"   = true
      ORDER BY m."createdAt" DESC
      LIMIT 50
    `, [productoId, empresaId]);

    return movs;
  }

  // ─── Categorías disponibles ─────────────────────────────────────────────────

  async getCategorias() {
    const empresaId = this.tenantSvc.getEmpresaId();
    const rows = await this.prodRepo
      .createQueryBuilder('p')
      .select('DISTINCT p.categoria', 'categoria')
      .where('p.empresaId = :eid', { eid: empresaId })
      .andWhere('p.isActive = :a', { a: true })
      .andWhere('p.categoria IS NOT NULL')
      .orderBy('p.categoria', 'ASC')
      .getRawMany<{ categoria: string }>();
    return rows.map(r => r.categoria).filter(Boolean);
  }
}
