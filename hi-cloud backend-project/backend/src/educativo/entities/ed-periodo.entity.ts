import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('ed_periodos')
export class EdPeriodo {
  @PrimaryGeneratedColumn() id!: number;
  @Column() empresaId!: number;
  @Column() anioEscolarId!: number;
  @Column({ length: 50 }) nombre!: string;
  @Column() numero!: number;
  @Column({ type: 'date', nullable: true }) fechaInicio?: string;
  @Column({ type: 'date', nullable: true }) fechaFin?: string;
  @Column({ type: 'decimal', precision: 5, scale: 2, default: 25 }) ponderacion!: number;
  @Column({ length: 20, default: 'abierto' }) estado!: string;
  @CreateDateColumn() createdAt!: Date;
}
