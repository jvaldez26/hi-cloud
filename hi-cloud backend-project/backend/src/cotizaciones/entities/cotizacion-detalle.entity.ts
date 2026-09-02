import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { Cotizacion } from './cotizacion.entity';
import { Producto } from '../../productos/entities/producto.entity';

@Entity('cotizacion_detalles')
export class CotizacionDetalle extends BaseEntity {
  @ManyToOne(() => Cotizacion, c => c.detalles, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'cotizacionId' })
  cotizacion!: Cotizacion;

  @Column()
  cotizacionId!: number;

  @ManyToOne(() => Producto, { eager: true, nullable: true })
  @JoinColumn({ name: 'productoId' })
  producto?: Producto;

  @Column({ nullable: true })
  productoId?: number;

  @Column({ length: 200 })
  descripcion!: string;

  @Column({ type: 'decimal', precision: 12, scale: 4 })
  precioUnitario!: number;

  @Column({ type: 'decimal', precision: 12, scale: 4 })
  cantidad!: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 18 })
  porcentajeIva!: number;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  subtotal!: number;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  importeIva!: number;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  total!: number;

  // ── Descuento por línea — mismo contrato que factura_detalles ─────────────
  // Convención A (formulario): precioUnitario es BRUTO y descuentoMonto es el
  // descuento TOTAL de la línea. Convención B (POS): precioOriginal presente,
  // precioUnitario ya viene NETO y descuentoMonto es POR UNIDAD.
  // Lo calcula common/calculo/descuento-documento.ts, igual que la factura: si
  // aquí se calculara distinto, el total cambiaría al convertir.
  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  descuentoPct!: number;

  /** Descuento en BASE IMPONIBLE. 4 decimales: sale de dividir entre 1 + ITBIS. */
  @Column({ type: 'decimal', precision: 12, scale: 4, default: 0 })
  descuentoMonto!: number;

  /** Precio bruto por unidad antes del descuento. Presente ⇒ convención B. */
  @Column({ type: 'decimal', precision: 12, scale: 4, nullable: true })
  precioOriginal?: number;
}
