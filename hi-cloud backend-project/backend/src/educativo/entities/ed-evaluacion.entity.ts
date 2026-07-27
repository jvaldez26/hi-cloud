import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('ed_evaluaciones')
export class EdEvaluacion {
  @PrimaryGeneratedColumn() id!: number;
  @Column() empresaId!: number;
  @Column({ nullable: true }) asignacionDocenteId?: number;
  @Column() seccionId!: number;
  @Column() asignaturaId!: number;
  @Column() periodoId!: number;
  @Column({ length: 200 }) nombre!: string;
  @Column({ length: 50, nullable: true }) tipo?: string;
  @Column({ type: 'date', nullable: true }) fecha?: string;
  @Column({ type: 'decimal', precision: 5, scale: 2, default: 100 }) puntajeMaximo!: number;
  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true }) ponderacion?: number;
  @Column({ length: 20, default: 'activa' }) estado!: string;
  @CreateDateColumn() createdAt!: Date;
}
