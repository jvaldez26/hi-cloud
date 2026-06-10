import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

@Entity('op_ordenes_trabajo')
export class OrdenTrabajoOptica {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  empresaId!: number;

  @Column({ length: 30 })
  numero!: string;

  @Column()
  pacienteId!: number;

  @Column({ type: 'int', nullable: true })
  recetaId!: number | null;

  @Column({ type: 'date' })
  fecha!: string;

  @Column({ length: 30, default: 'pendiente' })
  estado!: string;

  @Column({ length: 100, nullable: true })
  tipoLente!: string | null;

  @Column({ length: 100, nullable: true })
  materialLente!: string | null;

  @Column({ length: 200, nullable: true })
  tratamientoLente!: string | null;

  @Column({ length: 50, nullable: true })
  colorMontura!: string | null;

  @Column({ length: 100, nullable: true })
  marcaMontura!: string | null;

  @Column({ length: 100, nullable: true })
  modeloMontura!: string | null;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  subtotal!: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  itbis!: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  total!: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  abono!: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  balance!: number;

  @Column({ type: 'int', nullable: true })
  facturaId!: number | null;

  @Column({ type: 'text', nullable: true })
  notas!: string | null;

  @Column({ type: 'date', nullable: true })
  fechaEntrega!: string | null;

  @Column({ type: 'int', nullable: true })
  createdBy!: number | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
