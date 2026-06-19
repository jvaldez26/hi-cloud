import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('ag_ciclos')
export class AgCiclo {
  @PrimaryGeneratedColumn() id!: number;
  @Column() empresaId!: number;
  @Column({ length: 20, nullable: true }) numero?: string;
  @Column() parcelaId!: number;
  @Column() cultivoId!: number;
  @Column({ type: 'date' }) fechaSiembra!: string;
  @Column({ type: 'date', nullable: true }) fechaEstimadaCosecha?: string;
  @Column({ type: 'date', nullable: true }) fechaCosechaReal?: string;
  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true }) areaSembrada?: number;
  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true }) cantidadSemilla?: number;
  @Column({ length: 30, nullable: true }) unidadSemilla?: string;
  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true }) rendimientoEstimado?: number;
  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true }) cantidadCosechada?: number;
  @Column({ length: 30, nullable: true }) unidadCosecha?: string;
  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 }) mermaPerdida!: number;
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 }) costoSemilla!: number;
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 }) costoInsumos!: number;
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 }) costoManoObra!: number;
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 }) costoMaquinaria!: number;
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 }) costoOtros!: number;
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 }) costoTotal!: number;
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 }) ingresoVentas!: number;
  @Column({ length: 30, default: 'sembrado' }) estado!: string;
  @Column({ type: 'text', nullable: true }) notas?: string;
  @CreateDateColumn() createdAt!: Date;
  @UpdateDateColumn() updatedAt!: Date;
}
