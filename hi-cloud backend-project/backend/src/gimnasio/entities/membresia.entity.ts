import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('gm_membresias')
export class Membresia {
  @PrimaryGeneratedColumn() id!: number;
  @Column() empresaId!: number;
  @Column({ nullable: true }) numero?: string;
  @Column() miembroId!: number;
  @Column() planId!: number;
  @Column({ type: 'date' }) fechaInicio!: string;
  @Column({ type: 'date' }) fechaFin!: string;
  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 }) precio!: number;
  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 }) precioInscripcion!: number;
  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 }) descuento!: number;
  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 }) total!: number;
  @Column({ default: 'activa' }) estado!: string;
  @Column({ default: false }) congelada!: boolean;
  @Column({ type: 'date', nullable: true }) fechaCongelamiento?: string;
  @Column({ default: 0 }) diasCongelados!: number;
  @Column({ type: 'text', nullable: true }) motivoCongelamiento?: string;
  @Column({ nullable: true }) renovacionDe?: number;
  @Column({ nullable: true }) facturaId?: number;
  @Column({ type: 'text', nullable: true }) notas?: string;
  @CreateDateColumn() createdAt!: Date;
}
