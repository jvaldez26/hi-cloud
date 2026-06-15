import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('gm_rutinas')
export class Rutina {
  @PrimaryGeneratedColumn() id!: number;
  @Column() empresaId!: number;
  @Column() miembroId!: number;
  @Column({ nullable: true }) entrenadorId?: number;
  @Column({ length: 100 }) nombre!: string;
  @Column({ length: 200, nullable: true }) objetivo?: string;
  @Column({ default: 4 }) duracionSemanas!: number;
  @Column({ length: 50, nullable: true }) nivel?: string;
  @Column({ default: 3 }) diasSemana!: number;
  @Column({ type: 'date', nullable: true }) fechaInicio?: string;
  @Column({ type: 'date', nullable: true }) fechaFin?: string;
  @Column({ default: true }) activa!: boolean;
  @Column({ type: 'text', nullable: true }) notas?: string;
  @CreateDateColumn() createdAt!: Date;
}
