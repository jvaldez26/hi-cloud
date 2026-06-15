import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('gm_schedule')
export class Schedule {
  @PrimaryGeneratedColumn() id!: number;
  @Column() empresaId!: number;
  @Column() claseId!: number;
  @Column({ nullable: true }) entrenadorId?: number;
  @Column() diaSemana!: number;
  @Column({ type: 'time' }) horaInicio!: string;
  @Column({ type: 'time' }) horaFin!: string;
  @Column({ length: 50, nullable: true }) sala?: string;
  @Column({ type: 'date', nullable: true }) fechaDesde?: string;
  @Column({ type: 'date', nullable: true }) fechaHasta?: string;
  @Column({ default: true }) isActive!: boolean;
  @CreateDateColumn() createdAt!: Date;
}
