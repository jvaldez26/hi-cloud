import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('gm_planes_nutricionales')
export class PlanNutricional {
  @PrimaryGeneratedColumn() id!: number;
  @Column() empresaId!: number;
  @Column() miembroId!: number;
  @Column({ nullable: true }) entrenadorId?: number;
  @Column({ length: 100 }) nombre!: string;
  @Column({ length: 200, nullable: true }) objetivo?: string;
  @Column({ nullable: true }) caloriasObjetivo?: number;
  @Column({ type: 'decimal', precision: 6, scale: 2, nullable: true }) proteinasGramos?: number;
  @Column({ type: 'decimal', precision: 6, scale: 2, nullable: true }) carbohidratosGramos?: number;
  @Column({ type: 'decimal', precision: 6, scale: 2, nullable: true }) grasasGramos?: number;
  @Column({ type: 'date', nullable: true }) fechaInicio?: string;
  @Column({ type: 'date', nullable: true }) fechaFin?: string;
  @Column({ default: true }) activo!: boolean;
  @Column({ type: 'text', nullable: true }) notas?: string;
  @CreateDateColumn() createdAt!: Date;
}
