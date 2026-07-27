import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('ed_planes_pago')
export class EdPlanPago {
  @PrimaryGeneratedColumn() id!: number;
  @Column() empresaId!: number;
  @Column({ length: 150 }) nombre!: string;
  @Column({ nullable: true }) gradoId?: number;
  @Column({ nullable: true }) anioEscolarId?: number;
  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true }) montoInscripcion?: number;
  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true }) montoColegiaturaMensual?: number;
  @Column({ default: 10 }) cantidadCuotas!: number;
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 }) montoMaterial!: number;
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 }) montoSeguro!: number;
  @Column({ default: 5 }) diaVencimiento!: number;
  @Column({ type: 'decimal', precision: 6, scale: 3, default: 0 }) cargoMoraPct!: number;
  @Column({ default: 0 }) diasGracia!: number;
  @Column({ default: true }) isActive!: boolean;
  @CreateDateColumn() createdAt!: Date;
}
