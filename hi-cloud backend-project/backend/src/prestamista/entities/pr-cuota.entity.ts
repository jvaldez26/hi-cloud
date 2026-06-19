import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('pr_cuotas')
export class PrCuota {
  @PrimaryGeneratedColumn() id!: number;
  @Column() empresaId!: number;
  @Column() prestamoId!: number;
  @Column({ type: 'int' }) numeroCuota!: number;
  @Column({ type: 'date' }) fechaVencimiento!: string;
  @Column({ type: 'decimal', precision: 12, scale: 2 }) capital!: number;
  @Column({ type: 'decimal', precision: 12, scale: 2 }) interes!: number;
  @Column({ type: 'decimal', precision: 12, scale: 2 }) cuotaTotal!: number;
  @Column({ type: 'decimal', precision: 14, scale: 2, nullable: true }) saldoRestante?: number;
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 }) capitalPagado!: number;
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 }) interesPagado!: number;
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 }) moraGenerada!: number;
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 }) moraPagada!: number;
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 }) totalPagado!: number;
  @Column({ length: 20, default: 'pendiente' }) estado!: string;
  @Column({ type: 'date', nullable: true }) fechaPago?: string;
  @Column({ type: 'int', default: 0 }) diasMora!: number;
  @CreateDateColumn() createdAt!: Date;
}
