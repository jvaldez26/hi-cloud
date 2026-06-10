import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

@Entity('op_reclamaciones_ars')
export class ReclamacionArs {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  empresaId!: number;

  @Column({ length: 30 })
  numero!: string;

  @Column()
  pacienteId!: number;

  @Column({ length: 100 })
  arsNombre!: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  arsNumeroAfiliado!: string | null;

  @Column({ type: 'int', nullable: true })
  consultaId!: number | null;

  @Column({ type: 'int', nullable: true })
  recetaId!: number | null;

  @Column({ type: 'int', nullable: true })
  ordenTrabajoId!: number | null;

  @Column({ type: 'date' })
  fecha!: string;

  @Column({ length: 30, default: 'borrador' })
  estado!: string;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  montoReclamado!: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  montoCubierto!: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  montoPaciente!: number;

  @Column({ type: 'text', nullable: true })
  motivoRechazo!: string | null;

  @Column({ type: 'text', nullable: true })
  observaciones!: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
