import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('pr_solicitudes')
export class PrSolicitud {
  @PrimaryGeneratedColumn() id!: number;
  @Column() empresaId!: number;
  @Column({ length: 20, nullable: true }) numero?: string;
  @Column() deudorId!: number;
  @Column({ type: 'int', nullable: true }) productoId?: number;
  @Column({ type: 'decimal', precision: 12, scale: 2 }) montoSolicitado!: number;
  @Column({ type: 'int' }) plazoMeses!: number;
  @Column({ length: 20, nullable: true }) frecuenciaPago?: string;
  @Column({ type: 'text', nullable: true }) proposito?: string;
  @Column({ type: 'int', nullable: true }) oficialId?: number;
  @Column({ length: 200, nullable: true }) oficialNombre?: string;
  @Column({ type: 'date', nullable: true }) fechaSolicitud?: string;
  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true }) ingresoMensual?: number;
  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true }) gastosMensuales?: number;
  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true }) capacidadPago?: number;
  @Column({ length: 30, default: 'pendiente' }) estado!: string;
  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true }) montoAprobado?: number;
  @Column({ type: 'decimal', precision: 6, scale: 3, nullable: true }) tasaAprobada?: number;
  @Column({ type: 'date', nullable: true }) fechaDecision?: string;
  @Column({ length: 200, nullable: true }) decididoPor?: string;
  @Column({ type: 'text', nullable: true }) motivoRechazo?: string;
  @Column({ type: 'text', nullable: true }) observaciones?: string;
  @CreateDateColumn() createdAt!: Date;
}
