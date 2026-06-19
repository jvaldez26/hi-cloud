import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('pr_cobranzas')
export class PrCobranza {
  @PrimaryGeneratedColumn() id!: number;
  @Column() empresaId!: number;
  @Column() prestamoId!: number;
  @Column() deudorId!: number;
  @Column({ type: 'int', nullable: true }) cobradorId?: number;
  @Column({ length: 200, nullable: true }) cobradorNombre?: string;
  @Column({ type: 'timestamp', default: () => 'NOW()' }) fecha!: Date;
  @Column({ length: 30, nullable: true }) tipo?: string;
  @Column({ length: 50, nullable: true }) resultado?: string;
  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true }) montoPrometido?: number;
  @Column({ type: 'date', nullable: true }) fechaPromesaPago?: string;
  @Column({ type: 'text' }) descripcion!: string;
  @Column({ type: 'int', nullable: true }) diasMoraAlMomento?: number;
  @Column({ type: 'decimal', precision: 14, scale: 2, nullable: true }) saldoAlMomento?: number;
  @Column({ type: 'date', nullable: true }) proximaGestion?: string;
  @CreateDateColumn() createdAt!: Date;
}
