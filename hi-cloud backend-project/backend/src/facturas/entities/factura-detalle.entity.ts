import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { Producto } from '../../productos/entities/producto.entity';
import { Factura } from './factura.entity';

@Entity('factura_detalles')
export class FacturaDetalle extends BaseEntity {
  @ManyToOne(() => Factura, (f) => f.detalles, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'facturaId' })
  factura!: Factura;

  @Column()
  facturaId!: number;

  @ManyToOne(() => Producto, { eager: true, nullable: true })
  @JoinColumn({ name: 'productoId' })
  producto?: Producto;

  @Column({ nullable: true })
  productoId?: number;

  @Column({ nullable: true })
  opticaInventarioId?: number;

  @Column({ length: 200 })
  descripcion!: string;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  precioUnitario!: number;

  @Column({ type: 'int' })
  cantidad!: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 18 })
  porcentajeIva!: number;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  subtotal!: number;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  importeIva!: number;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  total!: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  descuentoPct!: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  descuentoMonto!: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  precioOriginal?: number;

  // Snapshot del costoPromedio del producto al momento de la venta (AVCO).
  // DEFAULT 0 cuando el producto no tiene costo registrado.
  @Column({ type: 'decimal', precision: 14, scale: 4, default: 0 })
  costoUnitario!: number;
}
