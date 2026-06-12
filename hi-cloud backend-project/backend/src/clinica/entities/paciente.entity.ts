import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('cl_pacientes')
export class Paciente {
  @PrimaryGeneratedColumn() id!: number;
  @Column() empresaId!: number;
  @Column({ length: 20, nullable: true }) codigo!: string | null;
  @Column({ length: 20, nullable: true }) cedula!: string | null;
  @Column({ length: 200 }) nombre!: string;
  @Column({ length: 200, nullable: true }) apellidos!: string | null;
  @Column({ type: 'date', nullable: true }) fechaNacimiento!: string | null;
  @Column({ length: 10, nullable: true }) sexo!: string | null;
  @Column({ length: 20, nullable: true }) estadoCivil!: string | null;
  @Column({ length: 20, nullable: true }) telefono!: string | null;
  @Column({ length: 20, nullable: true }) telefonoEmergencia!: string | null;
  @Column({ length: 100, nullable: true }) contactoEmergencia!: string | null;
  @Column({ length: 100, nullable: true }) email!: string | null;
  @Column({ type: 'text', nullable: true }) direccion!: string | null;
  @Column({ length: 100, nullable: true }) arsNombre!: string | null;
  @Column({ length: 50, nullable: true }) arsNumeroAfiliado!: string | null;
  @Column({ length: 30, nullable: true }) arsTipo!: string | null;
  @Column({ length: 100, nullable: true }) arsPlan!: string | null;
  @Column({ length: 10, nullable: true }) grupoSanguineo!: string | null;
  @Column({ type: 'text', nullable: true }) alergias!: string | null;
  @Column({ type: 'text', nullable: true }) antecedentesFamiliares!: string | null;
  @Column({ type: 'text', nullable: true }) antecedentesPersonales!: string | null;
  @Column({ type: 'text', nullable: true }) medicamentosActuales!: string | null;
  @Column({ type: 'int', nullable: true }) clienteId!: number | null;
  @Column({ default: true }) isActive!: boolean;
  @CreateDateColumn() createdAt!: Date;
  @UpdateDateColumn() updatedAt!: Date;
}
