import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('cl_procedimientos')
export class Procedimiento {
  @PrimaryGeneratedColumn() id!: number;
  @Column() empresaId!: number;
  @Column({ length: 20, nullable: true }) numero?: string;
  @Column() pacienteId!: number;
  @Column() medicoId!: number;
  @Column({ type: 'int', nullable: true }) consultaId!: number | null;
  @Column({ type: 'timestamp' }) fecha!: Date;
  @Column({ length: 200 }) nombre?: string;
  @Column({ type: 'text', nullable: true }) descripcion!: string | null;
  @Column({ type: 'int', nullable: true }) duracionMinutos!: number | null;
  @Column({ length: 100, nullable: true }) anestesia?: string;
  @Column({ length: 50, nullable: true }) sala?: string;
  @Column({ length: 30, default: 'programado' }) estado?: string;
  @Column({ type: 'text', nullable: true }) complicaciones!: string | null;
  @Column({ type: 'text', nullable: true }) notas!: string | null;
  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true }) costo!: number | null;
  @Column({ type: 'int', nullable: true }) facturaId!: number | null;
  @CreateDateColumn() createdAt!: Date;
}
