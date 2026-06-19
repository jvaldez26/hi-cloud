import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('ag_cosechas')
export class AgCosecha {
  @PrimaryGeneratedColumn() id!: number;
  @Column() empresaId!: number;
  @Column({ length: 20, nullable: true }) numero?: string;
  @Column() cicloId!: number;
  @Column({ type: 'int', nullable: true }) parcelaId?: number;
  @Column({ type: 'date' }) fecha!: string;
  @Column({ type: 'decimal', precision: 10, scale: 2 }) cantidad!: number;
  @Column({ length: 30, nullable: true }) unidad?: string;
  @Column({ length: 50, nullable: true }) calidad?: string;
  @Column({ type: 'jsonb', nullable: true }) clasificacion?: any;
  @Column({ length: 50, nullable: true }) destino?: string;
  @Column({ type: 'int', nullable: true }) cantidadTrabajadores?: number;
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 }) costoManoObra!: number;
  @Column({ type: 'int', nullable: true }) productoId?: number;
  @Column({ default: false }) ingresadoInventario!: boolean;
  @Column({ type: 'text', nullable: true }) notas?: string;
  @CreateDateColumn() createdAt!: Date;
}
