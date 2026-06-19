import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('pr_garantes')
export class PrGarante {
  @PrimaryGeneratedColumn() id!: number;
  @Column() empresaId!: number;
  @Column({ type: 'int', nullable: true }) prestamoId?: number;
  @Column({ type: 'int', nullable: true }) solicitudId?: number;
  @Column({ length: 200 }) nombre!: string;
  @Column({ length: 20, nullable: true }) cedula?: string;
  @Column({ length: 20, nullable: true }) telefono?: string;
  @Column({ type: 'text', nullable: true }) direccion?: string;
  @Column({ length: 100, nullable: true }) ocupacion?: string;
  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true }) ingresoMensual?: number;
  @Column({ length: 100, nullable: true }) relacionDeudor?: string;
  @Column({ type: 'jsonb', nullable: true }) documentosUrls?: any;
  @Column({ default: true }) isActive!: boolean;
  @CreateDateColumn() createdAt!: Date;
}
