import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import type { ModoPagoLavadorCw } from './tipos';

@Entity('cw_lavadores')
export class CwLavador {
  @PrimaryGeneratedColumn() id!: number;
  @Column() empresaId!: number;

  @Column({ length: 150 }) nombre!: string;
  @Column({ type: 'varchar', length: 20, nullable: true }) cedula?: string;
  @Column({ type: 'varchar', length: 20, nullable: true }) telefono?: string;
  @Column({ default: true }) activo!: boolean;

  @Column({ type: 'varchar', length: 20 }) modoPago!: ModoPagoLavadorCw;
  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 }) valorModoPago!: number;

  @CreateDateColumn() createdAt!: Date;
  @UpdateDateColumn() updatedAt!: Date;
}
