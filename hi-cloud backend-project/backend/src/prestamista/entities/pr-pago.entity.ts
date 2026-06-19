import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('pr_pagos')
export class PrPago {
  @PrimaryGeneratedColumn() id!: number;
  @Column() empresaId!: number;
  @Column({ length: 20, nullable: true }) numero?: string;
  @Column() prestamoId!: number;
  @Column() deudorId!: number;
  @Column({ type: 'timestamp', default: () => 'NOW()' }) fecha!: Date;
  @Column({ type: 'decimal', precision: 12, scale: 2 }) montoPagado!: number;
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 }) aplicadoMora!: number;
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 }) aplicadoInteres!: number;
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 }) aplicadoCapital!: number;
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 }) aplicadoCargos!: number;
  @Column({ length: 50, nullable: true }) metodoPago?: string;
  @Column({ length: 100, nullable: true }) referencia?: string;
  @Column({ type: 'int', nullable: true }) cobradorId?: number;
  @Column({ length: 200, nullable: true }) cobradorNombre?: string;
  @Column({ type: 'jsonb', nullable: true }) cuotasAfectadas?: any;
  @Column({ type: 'int', nullable: true }) facturaId?: number;
  @Column({ type: 'int', nullable: true }) reciboId?: number;
  @Column({ type: 'text', nullable: true }) notas?: string;
  @CreateDateColumn() createdAt!: Date;
}
