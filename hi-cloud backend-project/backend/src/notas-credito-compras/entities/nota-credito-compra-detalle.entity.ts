import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { NotaCreditoCompra } from './nota-credito-compra.entity';

@Entity('nota_credito_compra_detalles')
export class NotaCreditoCompraDetalle {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  notaCreditoCompraId!: number;

  @ManyToOne(() => NotaCreditoCompra, nc => nc.detalles, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'notaCreditoCompraId' })
  notaCreditoCompra!: NotaCreditoCompra;

  @Column({ nullable: true })
  productoId?: number;

  /** Línea de compra_detalles que esta línea de NC corrige — permite validar
   *  cantidad devuelta/no-recibida contra lo que esa línea específica
   *  realmente recibió/tiene pendiente (no el total de la OC). */
  @Column({ nullable: true })
  compraDetalleId?: number;

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
