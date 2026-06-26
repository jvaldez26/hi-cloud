import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('tr_combustible')
export class TrCombustible {
  @PrimaryGeneratedColumn() id!: number;
  @Column() empresaId!: number;
  @Column({ nullable: true }) vehiculoId?: number;
  @Column({ nullable: true }) choferId?: number;
  @Column({ type: 'date' }) fecha!: string;
  @Column({ length: 20, default: 'gasolina' }) tipoCombustible!: string;
  @Column({ type: 'decimal', precision: 8, scale: 3, nullable: true }) galones?: number;
  @Column({ type: 'decimal', precision: 8, scale: 2, nullable: true }) precioGalon?: number;
  @Column({ type: 'decimal', precision: 10, scale: 2 }) total!: number;
  @Column({ type: 'decimal', precision: 10, scale: 1, nullable: true }) odometro?: number;
  @Column({ length: 200, nullable: true }) estacion?: string;
  @Column({ type: 'text', nullable: true }) notas?: string;
  @CreateDateColumn() createdAt!: Date;
}
