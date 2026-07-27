import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('ed_calificaciones')
export class EdCalificacion {
  @PrimaryGeneratedColumn() id!: number;
  @Column() empresaId!: number;
  @Column() evaluacionId!: number;
  @Column() estudianteId!: number;
  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true }) nota?: number;
  @Column({ type: 'text', nullable: true }) observacion?: string;
  @Column({ default: true }) entregado!: boolean;
  @Column({ nullable: true }) registradoPor?: number;
  @CreateDateColumn() createdAt!: Date;
  @UpdateDateColumn() updatedAt!: Date;
}
