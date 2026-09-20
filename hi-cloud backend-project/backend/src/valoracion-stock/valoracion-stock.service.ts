import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Producto } from '../productos/entities/producto.entity';
import { TenantService } from '../tenant/tenant.service';

/**
 * FIX 3, COSTO DE VENTA COMMIT 1 (2026-09-20) — punto ÚNICO de conversión a
 * DOP. Conectado en el commit de conversión de moneda en compras
 * (2026-09-20): la investigación confirmó que el frontend de Compras NUNCA
 * convierte — envía precioUnitario en la moneda seleccionada + moneda +
 * tipoCambio tal cual — así que compras.service.ts (calcularDetalles()) es
 * quien llama a esta función antes de alimentar AVCO y el asiento contable.
 * Regla: el backend convierte, el frontend nunca.
 */
export function convertirADOP(monto: number, moneda: string | undefined, tipoCambio: number | undefined): number {
  if (!moneda || moneda === 'DOP') return monto;
  return +(monto * (tipoCambio ?? 1)).toFixed(4);
}

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
  //   nuevo_costo_prom = (stock_previo × costo_prom_actual + cant_nueva × costo_nuevo)
  //                     / (stock_previo + cant_nueva)
  //
  // stockAntes SIEMPRE lo manda el caller (el "cantidadAnterior" que ya
  // devuelve InventarioService.registrarEntrada) — este método NUNCA debe
  // leer producto.stock para la fórmula. Antes lo hacía con un findOne()
  // propio, pero cada caller ya había llamado a registrarEntrada() primero
  // (que persiste el stock NUEVO), así que ese findOne() siempre llegaba
  // tarde: leía stock_previo + cantidadNueva, no stock_previo. El promedio
  // quedaba mal para TODA compra, no solo para productos con costo manual —
  // en el caso límite de "producto sin stock previo, costo puesto a mano"
  // (ver AjustarCostoManualDto), la rama de abajo nunca se disparaba y el
  // costo manual quedaba mezclado 50/50 con el primer costo real en vez de
  // reemplazarse limpio.
  /**
   * FIX 3, COSTO DE VENTA COMMIT 1 (2026-09-20) — 2 de las 3 protecciones
   * que este método necesitaba antes de que un seed retroactivo (Fase 1 de
   * AVCO) pudiera correr con confianza:
   *
   *   1. empresaId en el WHERE — antes buscaba por `id` solo (sin scoping
   *      de tenant en absoluto); un productoId de otra empresa se leía y
   *      actualizaba igual. Ahora, si el producto no es de esta empresa,
   *      el SELECT no encuentra fila y la función no toca nada — mismo
   *      criterio que `if (!prod) return` ya usaba para "no existe".
   *   2. Transacción con SELECT ... FOR UPDATE sobre el producto — dos
   *      compras concurrentes del mismo producto ya no pueden leer el
   *      mismo costoPromedio "viejo" y pisarse el promedio entre sí (lost
   *      update): la segunda transacción espera a que la primera confirme,
   *      y relee el costoPromedio YA actualizado por la primera antes de
   *      calcular el suyo — mismo patrón que caja.service.ts:829-833 y
   *      cosechas.service.ts:79-84.
   *
   * La 3ra (conversión a DOP con tipoCambio) vive en convertirADOP() de
   * este mismo archivo — el caller (compras.service.ts) ya convierte antes
   * de llamar aquí, así que costoUnitarioNuevo que recibe este método
   * siempre llega en DOP.
   */
  async actualizarCostoPromedio(
    productoId: number,
    stockAntes: number,
    cantidadNueva: number,
    costoUnitarioNuevo: number,
  ): Promise<void> {
    const empresaId = this.tenantSvc.getEmpresaId();

    await this.dataSource.transaction(async (manager) => {
      const [prod] = await manager.query<{ id: number; costoPromedio: string }[]>(
        `SELECT id, "costoPromedio" FROM productos WHERE id = $1 AND "empresaId" = $2 FOR UPDATE`,
        [productoId, empresaId],
      );
      if (!prod) return;

      const costoActual = Number(prod.costoPromedio ?? 0);

      // Si no había stock previo, el nuevo costo ES el costo promedio —
      // reemplaza limpio cualquier valor puesto a mano (AjustarCostoManualDto),
      // no lo promedia: sin stock real detrás, ese valor era solo un punto de
      // partida provisional, nunca "unidades" que deban pesar en la fórmula.
      if (stockAntes <= 0) {
        await manager.query(`UPDATE productos SET "costoPromedio" = $1 WHERE id = $2`, [costoUnitarioNuevo, productoId]);
        return;
      }

      const nuevoCostoPromedio = (
        (stockAntes * costoActual) + (cantidadNueva * costoUnitarioNuevo)
      ) / (stockAntes + cantidadNueva);

      await manager.query(`UPDATE productos SET "costoPromedio" = $1 WHERE id = $2`, [
        +nuevoCostoPromedio.toFixed(4), productoId,
      ]);
    });
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
        codigo:        p.codigo ?? '',
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
