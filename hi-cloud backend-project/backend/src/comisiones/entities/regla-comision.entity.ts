import { Entity, Column, Index } from 'typeorm';
import { TenantBaseEntity } from '../../common/entities/tenant-base.entity';
import { TenantScoped } from '../../tenant/decorators/tenant-scoped.decorator';

export enum TipoReglaComision {
  GLOBAL         = 'global',          // aplica a todos
  POR_VENDEDOR   = 'por_vendedor',    // solo para un vendedor
  POR_CATEGORIA  = 'por_categoria',   // por categoría de producto
  POR_MONTO      = 'por_monto',       // tramo de monto de venta
  POR_ANTIGUEDAD = 'por_antiguedad',  // antigüedad del cobro (días desde factura)
}

@TenantScoped()
@Entity('reglas_comision')
@Index(['empresaId', 'isActive'])
export class ReglaComision extends TenantBaseEntity {
  @Column({ length: 100 })
  nombre!: string;

  @Column({ type: 'enum', enum: TipoReglaComision, default: TipoReglaComision.GLOBAL })
  tipo!: TipoReglaComision;

  @Column({ type: 'int', default: 100 })
  prioridad!: number;   // menor = se evalúa primero

  // ── Condiciones (según tipo) ─────────────────────────────────────────
  @Column({ nullable: true })
  vendedorId?: number;          // para POR_VENDEDOR

  // Columna física sigue llamándose "categoria" (varchar) para no pedir una
  // migración nueva — guarda el categoriaId del catálogo DE PRODUCTOS como
  // texto, mismo truco que ReglaDescuento.condicionValor. Antes guardaba el
  // NOMBRE de la categoría en texto libre y comparaba case-insensitive
  // contra Producto.categoria — el mismo bug de typos/acentos silenciosos
  // que ya se corrigió en descuentos.
  @Column({ name: 'categoria', length: 100, nullable: true })
  categoriaId?: string;         // para POR_CATEGORIA — string porque la columna es varchar

  @Column({ type: 'decimal', precision: 14, scale: 2, nullable: true })
  montoDesde?: number;          // para POR_MONTO

  @Column({ type: 'decimal', precision: 14, scale: 2, nullable: true })
  montoHasta?: number;          // para POR_MONTO

  @Column({ type: 'int', nullable: true })
  diasMaximoCobro?: number;     // para POR_ANTIGUEDAD — si se cobró en ≤N días

  // ── Porcentaje de comisión ─────────────────────────────────────────
  @Column({ type: 'decimal', precision: 5, scale: 2 })
  porcentaje!: number;

  @Column({ default: true })
  activa!: boolean;

  @Column({ type: 'text', nullable: true })
  descripcion?: string;
}
