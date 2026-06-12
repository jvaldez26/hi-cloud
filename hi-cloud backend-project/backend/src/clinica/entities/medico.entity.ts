import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('cl_medicos')
export class Medico {
  @PrimaryGeneratedColumn() id!: number;
  @Column() empresaId!: number;
  @Column({ length: 200 }) nombre?: string;
  @Column({ length: 200, nullable: true }) apellidos?: string;
  @Column({ length: 100, nullable: true }) especialidad?: string;
  @Column({ length: 100, nullable: true }) subespecialidad?: string;
  @Column({ length: 50, nullable: true }) exequatur?: string;
  @Column({ length: 50, nullable: true }) colegiatura?: string;
  @Column({ length: 20, nullable: true }) telefono?: string;
  @Column({ length: 100, nullable: true }) email?: string;
  @Column({ type: 'text', nullable: true }) firma!: string | null;
  @Column({ type: 'text', nullable: true }) selloUrl!: string | null;
  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true }) tarifaConsulta!: number | null;
  @Column({ length: 50, nullable: true }) horarioLunes?: string;
  @Column({ length: 50, nullable: true }) horarioMartes?: string;
  @Column({ length: 50, nullable: true }) horarioMiercoles?: string;
  @Column({ length: 50, nullable: true }) horarioJueves?: string;
  @Column({ length: 50, nullable: true }) horarioViernes?: string;
  @Column({ length: 50, nullable: true }) horarioSabado?: string;
  @Column({ length: 50, nullable: true }) horarioDomingo?: string;
  @Column({ type: 'int', nullable: true }) empleadoId!: number | null;
  @Column({ default: true }) isActive!: boolean;
  @CreateDateColumn() createdAt!: Date;
}
