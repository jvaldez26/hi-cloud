import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { NotaDebito } from './nota-debito.entity';

@Entity('nota_debito_detalles')
export class NotaDebitoDetalle {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  notaDebitoId!: number;

  @ManyToOne(() => NotaDebito, nd => nd.detalles, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'notaDebitoId' })
  notaDebito!: NotaDebito;

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
