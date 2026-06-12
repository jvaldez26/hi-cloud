import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('cl_pacientes')
export class Paciente {
  @PrimaryGeneratedColumn() id!: number;
  @Column() empresaId!: number;
  @Column({ length: 20, nullable: true }) codigo?: string;
  @Column({ length: 20, nullable: true }) cedula?: string;
  @Column({ length: 200 }) nombre?: string;
  @Column({ length: 200, nullable: true }) apellidos?: string;
  @Column({ type: 'date', nullable: true }) fechaNacimiento!: string | null;
  @Column({ length: 10, nullable: true }) sexo?: string;
  @Column({ length: 20, nullable: true }) estadoCivil?: string;
  @Column({ length: 20, nullable: true }) telefono?: string;
  @Column({ length: 20, nullable: true }) telefonoEmergencia?: string;
  @Column({ length: 100, nullable: true }) contactoEmergencia?: string;
  @Column({ length: 100, nullable: true }) email?: string;
  @Column({ type: 'text', nullable: true }) direccion!: string | null;
  @Column({ length: 100, nullable: true }) arsNombre?: string;
  @Column({ length: 50, nullable: true }) arsNumeroAfiliado?: string;
  @Column({ length: 30, nullable: true }) arsTipo?: string;
  @Column({ length: 100, nullable: true }) arsPlan?: string;
  @Column({ length: 10, nullable: true }) grupoSanguineo?: string;
  @Column({ type: 'text', nullable: true }) alergias!: string | null;
  @Column({ type: 'text', nullable: true }) antecedentesFamiliares!: string | null;
  @Column({ type: 'text', nullable: true }) antecedentesPersonales!: string | null;
  @Column({ type: 'text', nullable: true }) medicamentosActuales!: string | null;
  @Column({ type: 'int', nullable: true }) clienteId!: number | null;
  @Column({ default: true }) isActive!: boolean;
  @CreateDateColumn() createdAt!: Date;
  @UpdateDateColumn() updatedAt!: Date;
}
