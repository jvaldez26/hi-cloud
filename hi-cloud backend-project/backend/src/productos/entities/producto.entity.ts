import { Entity, Column, Index } from 'typeorm';
import { TenantBaseEntity } from '../../common/entities/tenant-base.entity';
import { TenantScoped } from '../../tenant/decorators/tenant-scoped.decorator';

@TenantScoped()
@Entity('productos')
@Index(['empresaId', 'isActive'])
export class Producto extends TenantBaseEntity {
  @Column({ length: 10, default: 'producto' })
  tipo!: string;  // 'producto' | 'servicio'

  @Column({ type: 'varchar', length: 30, nullable: true })
  codigo?: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  codigoBarras?: string | null;

  @Column({ length: 200 })
  nombre!: string;

  @Column({ type: 'text', nullable: true })
  descripcion?: string;

  @Column({ length: 20, default: 'PZA' })
  unidadMedida!: string;

  @Column({ type: 'decimal', precision: 14, scale: 4 })
  precio!: number;

  @Column({ type: 'decimal', precision: 14, scale: 4, nullable: true })
  precio2?: number;

  @Column({ type: 'decimal', precision: 14, scale: 4, nullable: true })
  precio3?: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 18 })
  porcentajeIva!: number;

  @Column({ type: 'decimal', precision: 12, scale: 4, default: 0 })
  stock!: number;

  @Column({ type: 'decimal', precision: 12, scale: 4, default: 0 })
  stockMinimo!: number;

  @Column({ type: 'decimal', precision: 12, scale: 4, nullable: true })
  stockMaximo?: number;

  @Column({ length: 100, nullable: true })
  categoria?: string;

  @Column({ length: 10, nullable: true })
  claveProductoSat?: string;

  @Column({ length: 10, nullable: true })
  claveUnidadSat?: string;

  @Column({ type: 'text', nullable: true })
  imagenUrl?: string;

  // Costo de compra / adquisición (manual)
  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  costo?: number;

  // Costo promedio ponderado (AVCO) — se actualiza al recibir mercancía
  @Column({ type: 'decimal', precision: 14, scale: 4, default: 0 })
  costoPromedio!: number;

  // Campos de identificación avanzada
  @Column({ length: 100, nullable: true })
  marca?: string;

  @Column({ length: 100, nullable: true })
  modelo?: string;

  @Column({ length: 100, nullable: true })
  referencia?: string;

  @Column({ default: false })
  esCreacionRapida!: boolean;

  // ── Balanzas etiquetadoras ────────────────────────────────────────────────
  /**
   * PLU (Product Lookup Unit): identificador entero único por empresa que la
   * balanza graba en el código de barras EAN-13.
   * NULL = este producto no usa balanza / no tiene PLU asignado.
   */
  @Column({ type: 'integer', nullable: true, default: null })
  plu?: number | null;

  /**
   * Indica que este producto se despacha por peso y puede recibirse desde una
   * balanza etiquetadora. Cuando es true:
   *  - unidadMedida debe ser una unidad con permiteDecimales=true (KG, LB, G…)
   *  - La cantidad en el carrito de POS se deriva del peso embebido en el código
   *    de barras o se ingresa como decimal.
   */
  @Column({ type: 'boolean', default: false })
  esPesable!: boolean;
}
