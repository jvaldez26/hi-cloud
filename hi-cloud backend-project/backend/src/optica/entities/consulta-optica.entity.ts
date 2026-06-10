import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

@Entity('op_consultas')
export class ConsultaOptica {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  empresaId!: number;

  @Column({ length: 30 })
  numero!: string;

  @Column()
  pacienteId!: number;

  @Column({ type: 'int', nullable: true })
  medicoId!: number | null;

  @Column({ type: 'int', nullable: true })
  citaId!: number | null;

  @Column({ type: 'date' })
  fecha!: string;

  @Column({ type: 'text', nullable: true })
  motivoConsulta!: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  agudezaVisualOD!: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  agudezaVisualOI!: string | null;

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  presionOcularOD!: number | null;

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  presionOcularOI!: number | null;

  @Column({ type: 'text', nullable: true })
  hallazgos!: string | null;

  @Column({ type: 'text', nullable: true })
  diagnostico!: string | null;

  @Column({ type: 'text', nullable: true })
  tratamiento!: string | null;

  @Column({ type: 'date', nullable: true })
  proximaCita!: string | null;

  @Column({ type: 'text', nullable: true })
  notas!: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
