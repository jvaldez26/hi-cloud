import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('ed_pagos')
export class EdPago {
  @PrimaryGeneratedColumn() id!: number;
  @Column() empresaId!: number;
  @Column({ length: 20, nullable: true }) numero?: string;
  @Column() estudianteId!: number;
  @Column({ nullable: true }) tutorId?: number;
  @Column({ type: 'timestamp', default: () => 'NOW()' }) fecha!: Date;
  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true }) montoPagado?: number;
  @Column({ length: 50, nullable: true }) metodoPago?: string;
  @Column({ length: 100, nullable: true }) referencia?: string;
  @Column({ type: 'jsonb', nullable: true }) cargosAfectados?: number[];
  @Column({ nullable: true }) facturaId?: number;
  @Column({ nullable: true }) reciboId?: number;
  @Column({ type: 'text', nullable: true }) notas?: string;
  @CreateDateColumn() createdAt!: Date;
  // Columnas simplificadas (migración FixColegiaturaSchema)
  @Column({ nullable: true }) cargoId?: number;
  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true }) monto?: number;
  @Column({ type: 'text', nullable: true }) observaciones?: string;
}
