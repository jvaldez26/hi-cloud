import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('cl_citas')
export class Cita {
  @PrimaryGeneratedColumn() id!: number;
  @Column() empresaId!: number;
  @Column({ length: 20, nullable: true }) numero!: string | null;
  @Column() pacienteId!: number;
  @Column() medicoId!: number;
  @Column({ type: 'date' }) fecha!: string;
  @Column({ type: 'time' }) hora!: string;
  @Column({ default: 30 }) duracionMinutos!: number;
  @Column({ length: 50, nullable: true }) tipoCita!: string | null;
  @Column({ type: 'text', nullable: true }) motivo!: string | null;
  @Column({ length: 20, default: 'programada' }) estado!: string;
  @Column({ length: 50, nullable: true }) sala!: string | null;
  @Column({ length: 20, default: 'normal' }) prioridad!: string;
  @Column({ default: false }) recordatorioEnviado!: boolean;
  @Column({ type: 'text', nullable: true }) notas!: string | null;
  @CreateDateColumn() createdAt!: Date;
}
