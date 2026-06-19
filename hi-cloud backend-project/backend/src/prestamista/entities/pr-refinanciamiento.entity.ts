import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('pr_refinanciamientos')
export class PrRefinanciamiento {
  @PrimaryGeneratedColumn() id!: number;
  @Column() empresaId!: number;
  @Column() prestamoOriginalId!: number;
  @Column({ type: 'int', nullable: true }) prestamoNuevoId?: number;
  @Column() deudorId!: number;
  @Column({ type: 'decimal', precision: 14, scale: 2, nullable: true }) saldoCapitalOriginal?: number;
  @Column({ type: 'decimal', precision: 14, scale: 2, nullable: true }) saldoInteresOriginal?: number;
  @Column({ type: 'decimal', precision: 14, scale: 2, nullable: true }) saldoMoraOriginal?: number;
  @Column({ type: 'decimal', precision: 14, scale: 2, nullable: true }) saldoTotalOriginal?: number;
  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true }) montoNuevo?: number;
  @Column({ type: 'decimal', precision: 6, scale: 3, nullable: true }) nuevaTasa?: number;
  @Column({ type: 'int', nullable: true }) nuevoPlazo?: number;
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 }) moraCondonada!: number;
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 }) interesCondonado!: number;
  @Column({ type: 'date', nullable: true }) fecha?: string;
  @Column({ length: 200, nullable: true }) autorizadoPor?: string;
  @Column({ type: 'text', nullable: true }) motivo?: string;
  @CreateDateColumn() createdAt!: Date;
}
