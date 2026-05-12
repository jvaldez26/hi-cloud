import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { ConteoInventario } from './conteo-inventario.entity';

@Entity('lineas_conteo')
export class LineaConteo {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  conteoId!: number;

  @ManyToOne(() => ConteoInventario, c => c.lineas, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'conteoId' })
  conteo!: ConteoInventario;

  @Column()
  productoId!: number;

  @Column({ length: 30, nullable: true })
  productoCodigo?: string;

  @Column({ length: 200, nullable: true })
  productoNombre?: string;

  @Column({ length: 100, nullable: true })
  categoriaProducto?: string;

  @Column({ type: 'decimal', precision: 12, scale: 4, default: 0 })
  cantidadSistema!: number;

  @Column({ type: 'decimal', precision: 12, scale: 4, nullable: true })
  cantidadFisica?: number;

  @Column({ type: 'decimal', precision: 12, scale: 4, default: 0 })
  diferencia!: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  costoUnitario!: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  costoVariacion!: number;

  @Column({ type: 'text', nullable: true })
  observaciones?: string;
}
