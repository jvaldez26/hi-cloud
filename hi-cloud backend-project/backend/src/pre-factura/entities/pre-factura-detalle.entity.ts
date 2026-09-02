import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { PreFactura } from './pre-factura.entity';

@Entity('pre_factura_detalles')
export class PreFacturaDetalle {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  preFacturaId!: number;

  @ManyToOne(() => PreFactura, pf => pf.detalles, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'preFacturaId' })
  preFactura!: PreFactura;

  @Column({ nullable: true })
  productoId?: number;

  @Column({ length: 300 })
  descripcion!: string;

  @Column({ length: 20, default: 'PZA' })
  unidadMedida!: string;

  @Column({ type: 'decimal', precision: 12, scale: 4 })
  cantidad!: number;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  precioUnitario!: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 18 })
  porcentajeIva!: number;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  subtotal!: number;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  iva!: number;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  total!: number;

  // ── Descuento por línea — mismo contrato que factura_detalles ─────────────
  // Convención A: precioUnitario BRUTO, descuentoMonto = total de la línea.
  // Convención B (POS): precioOriginal presente, precio ya NETO, descuentoMonto
  // POR UNIDAD. Lo calcula common/calculo/descuento-documento.ts, el mismo
  // helper que la factura.
  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  descuentoPct!: number;

  /** Descuento en BASE IMPONIBLE. 4 decimales: sale de dividir entre 1 + ITBIS. */
  @Column({ type: 'decimal', precision: 12, scale: 4, default: 0 })
  descuentoMonto!: number;

  /** Precio bruto por unidad antes del descuento. Presente ⇒ convención B. */
  @Column({ type: 'decimal', precision: 12, scale: 4, nullable: true })
  precioOriginal?: number;
}
