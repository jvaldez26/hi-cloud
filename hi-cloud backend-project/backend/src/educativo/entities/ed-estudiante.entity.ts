import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('ed_estudiantes')
export class EdEstudiante {
  @PrimaryGeneratedColumn() id!: number;
  @Column() empresaId!: number;
  @Column({ length: 30, nullable: true }) matricula?: string;
  @Column({ length: 200 }) nombres!: string;
  @Column({ length: 200 }) apellidos!: string;
  @Column({ length: 20, nullable: true }) cedula?: string;
  @Column({ length: 50, nullable: true }) actaNacimiento?: string;
  @Column({ type: 'date', nullable: true }) fechaNacimiento?: string;
  @Column({ length: 10, nullable: true }) sexo?: string;
  @Column({ length: 50, default: 'Dominicana' }) nacionalidad!: string;
  @Column({ type: 'text', nullable: true }) direccion?: string;
  @Column({ length: 20, nullable: true }) telefono?: string;
  @Column({ length: 100, nullable: true }) email?: string;
  @Column({ type: 'text', nullable: true }) foto?: string;
  @Column({ length: 10, nullable: true }) tipoSangre?: string;
  @Column({ type: 'text', nullable: true }) alergias?: string;
  @Column({ type: 'text', nullable: true }) condicionesMedicas?: string;
  @Column({ length: 20, nullable: true }) medicoTelefono?: string;
  @Column({ length: 100, nullable: true }) seguroMedico?: string;
  @Column({ length: 200, nullable: true }) colegioProcedencia?: string;
  @Column({ length: 20, default: 'activo' }) estado!: string;
  @Column({ type: 'date', nullable: true }) fechaIngreso?: string;
  @Column({ type: 'text', nullable: true }) observaciones?: string;
  @Column({ nullable: true }) clienteId?: number;
  @Column({ default: true }) isActive!: boolean;
  @CreateDateColumn() createdAt!: Date;
  @UpdateDateColumn() updatedAt!: Date;
}
