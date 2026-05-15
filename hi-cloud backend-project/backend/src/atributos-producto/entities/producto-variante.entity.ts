import { Entity, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { TenantBaseEntity } from '../../common/entities/tenant-base.entity';
import { Producto } from '../../productos/entities/producto.entity';
import { TenantScoped } from '../../tenant/decorators/tenant-scoped.decorator';

/**
 * Variante de un producto — combinación de atributos con stock propio.
 * Ejemplo: "Camisa Polo" → variante "Talla: XL / Color: Azul"
 */
@TenantScoped()
@Entity('producto_variantes')
@Index(['empresaId', 'productoId'])
@Index(['empresaId', 'sku'])
export class ProductoVariante extends TenantBaseEntity {
  @ManyToOne(() => Producto, { eager: true })
  @JoinColumn({ name: 'productoId' })
  producto!: Producto;

  @Column()
  productoId!: number;

  @Column({ length: 50 })
  sku!: string;        // Código único de la variante

  @Column({ length: 200 })
  nombre!: string;     // "Camisa Polo XL Azul" — generado automáticamente

  // Combinación de atributos: [{atributoId, atributoNombre, valorId, valor}]
  @Column({ type: 'jsonb' })
  atributos!: Array<{
    atributoId:    number;
    atributoNombre: string;
    valorId:       number;
    valor:         string;
    colorHex?:     string;
  }>;

  @Column({ type: 'decimal', precision: 12, scale: 4, default: 0 })
  stock!: number;

  @Column({ type: 'decimal', precision: 12, scale: 4, default: 0 })
  stockMinimo!: number;

  // Si null → usa el precio del producto padre
  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  precioOverride?: number;

  @Column({ type: 'decimal', precision: 14, scale: 4, default: 0 })
  costoPromedio!: number;

  @Column({ default: true })
  activa!: boolean;

  @Column({ type: 'text', nullable: true })
  imagenUrl?: string;
}
