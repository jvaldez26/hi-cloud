import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('pr_garantias')
export class PrGarantia {
  @PrimaryGeneratedColumn() id!: number;
  @Column() empresaId!: number;
  @Column({ type: 'int', nullable: true }) prestamoId?: number;
  @Column({ type: 'int', nullable: true }) solicitudId?: number;
  @Column() deudorId!: number;
  @Column({ length: 50 }) tipo!: string;
  @Column({ type: 'text' }) descripcion!: string;
  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true }) valorTasado?: number;
  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true }) valorRealizacion?: number;
  @Column({ type: 'jsonb', nullable: true }) detalles?: any;
  @Column({ type: 'jsonb', nullable: true }) documentosUrls?: any;
  @Column({ type: 'jsonb', nullable: true }) fotosUrls?: any;
  @Column({ length: 20, default: 'activa' }) estado!: string;
  @Column({ length: 200, nullable: true }) ubicacion?: string;
  @Column({ type: 'text', nullable: true }) notas?: string;
  @CreateDateColumn() createdAt!: Date;
}
