import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('ed_pagos')
export class EdPago {
  @PrimaryGeneratedColumn() id!: number;
  @Column() empresaId!: number;
  // Reservado, nunca se genera todavía — igual que ed_cargos.numero.
  @Column({ length: 20, nullable: true }) numero?: string;
  @Column() estudianteId!: number;
  // Reservado — quién de los tutores hizo el pago, sin UI todavía.
  @Column({ nullable: true }) tutorId?: number;
  @Column({ type: 'timestamp', default: () => 'NOW()' }) fecha!: Date;
  @Column({ type: 'decimal', precision: 12, scale: 2 }) montoPagado!: number;
  @Column({ length: 50, nullable: true }) metodoPago?: string;
  @Column({ length: 100, nullable: true }) referencia?: string;
  @Column({ type: 'text', nullable: true }) observaciones?: string;
  @CreateDateColumn() createdAt!: Date;
  // Anular (migración ReconciliarEdPagos) — el registro nunca se borra.
  @Column({ length: 20, default: 'activo' }) estado!: string;
  @Column({ type: 'text', nullable: true }) motivoAnulacion?: string;
  @Column({ nullable: true }) anuladoPor?: number;
  @Column({ type: 'timestamp', nullable: true }) anuladoEn?: Date;
}
