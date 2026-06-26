import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('tr_vehiculos')
export class TrVehiculo {
  @PrimaryGeneratedColumn() id!: number;
  @Column() empresaId!: number;
  @Column({ length: 20 }) placa!: string;
  @Column({ length: 100 }) marca!: string;
  @Column({ length: 100 }) modelo!: string;
  @Column({ nullable: true }) anio?: number;
  @Column({ length: 30, default: 'camion' }) tipo!: string;
  @Column({ length: 50, nullable: true }) color?: string;
  @Column({ length: 50, nullable: true }) capacidad?: string;
  @Column({ length: 30, default: 'operativo' }) estado!: string;
  @Column({ nullable: true }) choferId?: number;
  @Column({ type: 'date', nullable: true }) seguroVencimiento?: string;
  @Column({ type: 'date', nullable: true }) marbeteVencimiento?: string;
  @Column({ type: 'date', nullable: true }) inspeccionVencimiento?: string;
  @Column({ type: 'text', nullable: true }) notas?: string;
  @Column({ default: true }) isActive!: boolean;
  @CreateDateColumn() createdAt!: Date;
  @UpdateDateColumn() updatedAt!: Date;
}
