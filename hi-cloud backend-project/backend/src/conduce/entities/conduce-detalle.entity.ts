import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { Conduce } from './conduce.entity';

@Entity('conduce_detalles')
export class ConduceDetalle {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  conduceId!: number;

  @ManyToOne(() => Conduce, c => c.detalles, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'conduceId' })
  conduce!: Conduce;

  @Column({ nullable: true })
  productoId?: number;

  @Column({ length: 300 })
  descripcion!: string;

  @Column({ length: 20, default: 'PZA' })
  unidadMedida!: string;

  @Column({ type: 'decimal', precision: 12, scale: 4 })
  cantidad!: number;

  @Column({ type: 'decimal', precision: 12, scale: 4, default: 0 })
  cantidadDevuelta!: number;

  @Column({ type: 'text', nullable: true })
  observaciones?: string;
}
