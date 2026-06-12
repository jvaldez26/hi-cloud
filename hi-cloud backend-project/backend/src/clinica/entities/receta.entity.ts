import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('cl_recetas')
export class Receta {
  @PrimaryGeneratedColumn() id!: number;
  @Column() empresaId!: number;
  @Column({ length: 20, nullable: true }) numero?: string;
  @Column() pacienteId!: number;
  @Column() medicoId!: number;
  @Column({ type: 'int', nullable: true }) consultaId!: number | null;
  @Column({ type: 'date' }) fecha!: string;
  @Column({ type: 'date', nullable: true }) fechaVencimiento!: string | null;
  @Column({ type: 'text', nullable: true }) diagnostico!: string | null;
  @Column({ type: 'text', nullable: true }) indicacionesGenerales!: string | null;
  @CreateDateColumn() createdAt!: Date;
}
