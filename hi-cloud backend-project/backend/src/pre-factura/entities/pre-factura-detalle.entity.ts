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
}
