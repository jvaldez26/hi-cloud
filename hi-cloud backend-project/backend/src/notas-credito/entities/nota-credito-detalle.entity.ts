import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { NotaCredito } from './nota-credito.entity';

@Entity('nota_credito_detalles')
export class NotaCreditoDetalle {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  notaCreditoId!: number;

  @ManyToOne(() => NotaCredito, nc => nc.detalles, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'notaCreditoId' })
  notaCredito!: NotaCredito;

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
