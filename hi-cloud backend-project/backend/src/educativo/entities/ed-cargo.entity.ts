import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('ed_cargos')
export class EdCargo {
  @PrimaryGeneratedColumn() id!: number;
  @Column() empresaId!: number;
  @Column({ length: 20, nullable: true }) numero?: string;
  @Column() estudianteId!: number;
  @Column({ nullable: true }) matriculaId?: number;
  @Column({ nullable: true }) tutorResponsableId?: number;
  @Column({ length: 30 }) tipo!: string;
  @Column({ length: 200, nullable: true }) concepto?: string;
  @Column({ length: 20, nullable: true }) periodo?: string;
  @Column({ type: 'decimal', precision: 12, scale: 2 }) montoOriginal!: number;
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 }) descuento!: number;
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 }) montoMora!: number;
  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true }) montoTotal?: number;
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 }) montoPagado!: number;
  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true }) saldoPendiente?: number;
  @Column({ type: 'date', nullable: true }) fechaVencimiento?: string;
  @Column({ type: 'date', nullable: true }) fechaPago?: string;
  @Column({ length: 20, default: 'pendiente' }) estado!: string;
  @Column({ default: 0 }) diasMora!: number;
  @Column({ nullable: true }) facturaId?: number;
  @CreateDateColumn() createdAt!: Date;
}
