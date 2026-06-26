import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('tr_mantenimiento')
export class TrMantenimiento {
  @PrimaryGeneratedColumn() id!: number;
  @Column() empresaId!: number;
  @Column({ nullable: true }) vehiculoId?: number;
  @Column({ type: 'date' }) fecha!: string;
  @Column({ length: 20, default: 'preventivo' }) tipo!: string;
  @Column({ type: 'text' }) descripcion!: string;
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 }) costo!: number;
  @Column({ length: 200, nullable: true }) proveedor?: string;
  @Column({ type: 'decimal', precision: 10, scale: 1, nullable: true }) odometroActual?: number;
  @Column({ type: 'date', nullable: true }) proximaFecha?: string;
  @Column({ type: 'decimal', precision: 10, scale: 1, nullable: true }) proximoKm?: number;
  @Column({ length: 20, default: 'programado' }) estado!: string;
  @Column({ type: 'text', nullable: true }) notas?: string;
  @CreateDateColumn() createdAt!: Date;
  @UpdateDateColumn() updatedAt!: Date;
}
