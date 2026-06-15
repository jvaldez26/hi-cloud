import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('gm_entrenadores')
export class Entrenador {
  @PrimaryGeneratedColumn() id!: number;
  @Column() empresaId!: number;
  @Column({ length: 100 }) nombre!: string;
  @Column({ length: 100, nullable: true }) apellidos?: string;
  @Column({ length: 100, nullable: true }) especialidad?: string;
  @Column({ type: 'text', nullable: true }) certificaciones?: string;
  @Column({ length: 500, nullable: true }) foto?: string;
  @Column({ length: 20, nullable: true }) telefono?: string;
  @Column({ length: 150, nullable: true }) email?: string;
  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 }) tarifaSesion!: number;
  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 }) tarifaMes!: number;
  @Column({ type: 'jsonb', nullable: true }) horario?: any;
  @Column({ nullable: true }) empleadoId?: number;
  @Column({ default: true }) isActive!: boolean;
  @CreateDateColumn() createdAt!: Date;
}
