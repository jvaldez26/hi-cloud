import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('gm_sesiones_ep')
export class SesionEP {
  @PrimaryGeneratedColumn() id!: number;
  @Column() empresaId!: number;
  @Column() miembroId!: number;
  @Column({ nullable: true }) entrenadorId?: number;
  @Column({ nullable: true }) membresiaId?: number;
  @Column({ type: 'timestamp' }) fecha!: Date;
  @Column({ default: 60 }) duracionMinutos!: number;
  @Column({ length: 50, nullable: true }) tipo?: string;
  @Column({ default: 'programada' }) estado!: string;
  @Column({ type: 'text', nullable: true }) observaciones?: string;
  @Column({ type: 'date', nullable: true }) proximaSesion?: string;
  @Column({ default: false }) pagado!: boolean;
  @Column({ nullable: true }) facturaId?: number;
  @CreateDateColumn() createdAt!: Date;
}
