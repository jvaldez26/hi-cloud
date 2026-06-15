import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('gm_clases')
export class Clase {
  @PrimaryGeneratedColumn() id!: number;
  @Column() empresaId!: number;
  @Column({ length: 100 }) nombre!: string;
  @Column({ type: 'text', nullable: true }) descripcion?: string;
  @Column({ length: 50, nullable: true }) tipo?: string;
  @Column({ length: 50, nullable: true }) categoria?: string;
  @Column({ default: 20 }) capacidadMaxima!: number;
  @Column({ default: 60 }) duracionMinutos!: number;
  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 }) costoAdicional!: number;
  @Column({ nullable: true }) entrenadorId?: number;
  @Column({ length: 500, nullable: true }) imagenUrl?: string;
  @Column({ default: '#1E3A8A' }) color!: string;
  @Column({ default: true }) isActive!: boolean;
  @CreateDateColumn() createdAt!: Date;
}
