import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('gm_rutina_ejercicios')
export class RutinaEjercicio {
  @PrimaryGeneratedColumn() id!: number;
  @Column() empresaId!: number;
  @Column() rutinaDiaId!: number;
  @Column({ length: 100 }) nombre!: string;
  @Column({ length: 100, nullable: true }) grupoMuscular?: string;
  @Column({ nullable: true }) series?: number;
  @Column({ length: 50, nullable: true }) repeticiones?: string;
  @Column({ nullable: true }) descansoSegundos?: number;
  @Column({ type: 'decimal', precision: 6, scale: 2, nullable: true }) pesoKg?: number;
  @Column({ type: 'text', nullable: true }) notas?: string;
  @Column({ length: 500, nullable: true }) videoUrl?: string;
  @Column({ length: 500, nullable: true }) imagenUrl?: string;
  @Column({ default: 0 }) orden!: number;
}
