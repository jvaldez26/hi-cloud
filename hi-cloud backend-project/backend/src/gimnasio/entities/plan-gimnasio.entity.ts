import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('gm_planes')
export class PlanGimnasio {
  @PrimaryGeneratedColumn() id!: number;
  @Column() empresaId!: number;
  @Column({ length: 100 }) nombre!: string;
  @Column({ type: 'text', nullable: true }) descripcion?: string;
  @Column({ length: 50, nullable: true }) tipo?: string;
  @Column({ default: 30 }) duracionDias!: number;
  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 }) precio!: number;
  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 }) precioInscripcion!: number;
  @Column({ default: 'DOP' }) moneda!: string;
  @Column({ default: true }) incluyeClases!: boolean;
  @Column({ nullable: true }) limiteClasesMes?: number;
  @Column({ default: false }) incluyeEntrenadorPersonal!: boolean;
  @Column({ default: 0 }) sesionesEntrenadorMes!: number;
  @Column({ default: false }) incluyeNutricion!: boolean;
  @Column({ default: false }) incluyeLocker!: boolean;
  @Column({ default: false }) acceso24h!: boolean;
  @Column({ default: true }) permiteCongelar!: boolean;
  @Column({ default: 15 }) diasCongelamientoMax!: number;
  @Column({ default: true }) renovacionAutomatica!: boolean;
  @Column({ default: true }) isActive!: boolean;
  @CreateDateColumn() createdAt!: Date;
}
