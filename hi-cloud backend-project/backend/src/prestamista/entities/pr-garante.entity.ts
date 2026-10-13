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
  /**
   * Ciclo de vida (Etapa 2 resto, §2) — nunca se libera automáticamente al
   * pagarse el préstamo; un ADMIN libera a mano con motivo.
   */
  @Column({ length: 20, default: 'activo' }) estado!: string;
  @Column({ type: 'int', nullable: true }) liberadoPor?: number;
  @Column({ length: 200, nullable: true }) liberadoPorNombre?: string;
  @Column({ type: 'timestamp', nullable: true }) liberadoEn?: Date;
  @Column({ type: 'text', nullable: true }) motivoLiberacion?: string;
  @CreateDateColumn() createdAt!: Date;
}
