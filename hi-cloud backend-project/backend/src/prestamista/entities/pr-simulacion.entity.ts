import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('pr_simulaciones')
@Index(['empresaId', 'deudorId'])
export class PrSimulacion {
  @PrimaryGeneratedColumn() id!: number;
  @Column() empresaId!: number;
  @Column({ type: 'int', nullable: true }) deudorId?: number;
  @Column({ length: 200, nullable: true }) nombreProspecto?: string;
  @Column({ length: 200 }) nombre!: string;
  /** motorConfig + montoPrincipal/fechaDesembolso/fechaPrimerPago/plazoPeriodos — SimularPrestamoDto tal cual. */
  @Column({ type: 'jsonb' }) parametros!: Record<string, unknown>;
  /** TablaAmortizacion calculada al crear — nunca se recalcula al listar/recuperar. */
  @Column({ type: 'jsonb' }) resultado!: Record<string, unknown>;
  @Column({ type: 'int', nullable: true }) creadoPor?: number;
  @CreateDateColumn() createdAt!: Date;
}
