import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('ag_maquinaria')
export class AgMaquinaria {
  @PrimaryGeneratedColumn() id!: number;
  @Column() empresaId!: number;
  @Column({ length: 200 }) nombre!: string;
  @Column({ length: 50, nullable: true }) tipo?: string;
  @Column({ length: 100, nullable: true }) marca?: string;
  @Column({ length: 100, nullable: true }) modelo?: string;
  @Column({ type: 'int', nullable: true }) anio?: number;
  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true }) costoHora?: number;
  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 }) horasUso!: number;
  @Column({ type: 'date', nullable: true }) ultimoMantenimiento?: string;
  @Column({ type: 'date', nullable: true }) proximoMantenimiento?: string;
  @Column({ length: 30, default: 'operativo' }) estado!: string;
  @Column({ type: 'text', nullable: true }) notas?: string;
  @Column({ default: true }) isActive!: boolean;
  @CreateDateColumn() createdAt!: Date;
}
