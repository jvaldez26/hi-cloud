import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('ag_insumos')
export class AgInsumo {
  @PrimaryGeneratedColumn() id!: number;
  @Column() empresaId!: number;
  @Column({ length: 200 }) nombre!: string;
  @Column({ length: 50, nullable: true }) tipo?: string;
  @Column({ length: 100, nullable: true }) marca?: string;
  @Column({ length: 100, nullable: true }) presentacion?: string;
  @Column({ length: 30, nullable: true }) unidad?: string;
  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 }) stockActual!: number;
  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 }) stockMinimo!: number;
  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true }) costoUnitario?: number;
  @Column({ default: false }) requiereReceta!: boolean;
  @Column({ type: 'int', nullable: true }) periodoCarencia?: number;
  @Column({ type: 'int', nullable: true }) productoId?: number;
  @Column({ default: true }) isActive!: boolean;
  @CreateDateColumn() createdAt!: Date;
}
