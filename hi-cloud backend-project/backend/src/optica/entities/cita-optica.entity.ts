import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

@Entity('op_citas')
export class CitaOptica {
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

  @Column({ type: 'timestamp' })
  fechaHora!: Date;

  @Column({ default: 30 })
  duracionMinutos!: number;

  @Column({ length: 50, default: 'consulta' })
  tipo!: string;

  @Column({ length: 30, default: 'programada' })
  estado!: string;

  @Column({ type: 'text', nullable: true })
  motivoConsulta!: string | null;

  @Column({ type: 'text', nullable: true })
  notas!: string | null;

  @Column({ type: 'int', nullable: true })
  createdBy!: number | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
