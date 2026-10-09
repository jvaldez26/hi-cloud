import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('pr_prestamos')
export class PrPrestamo {
  @PrimaryGeneratedColumn() id!: number;
  @Column() empresaId!: number;
  @Column({ length: 20 }) numero!: string;
  @Column({ type: 'int', nullable: true }) solicitudId?: number;
  @Column() deudorId!: number;
  @Column({ type: 'int', nullable: true }) productoId?: number;
  @Column({ type: 'decimal', precision: 12, scale: 2 }) montoPrincipal!: number;
  @Column({ type: 'decimal', precision: 6, scale: 3 }) tasaInteresMensual!: number;
  @Column({ type: 'int' }) plazoMeses!: number;
  @Column({ length: 20 }) frecuenciaPago!: string;
  @Column({ length: 20, default: 'frances' }) metodoAmortizacion!: string;
  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true }) cuotaPeriodica?: number;
  @Column({ type: 'decimal', precision: 6, scale: 3, default: 0 }) porcentajeMora!: number;
  @Column({ type: 'int', default: 0 }) diasGracia!: number;
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 }) cargoCierre!: number;
  @Column({ type: 'date' }) fechaDesembolso!: string;
  @Column({ type: 'date' }) fechaPrimerPago!: string;
  @Column({ type: 'date' }) fechaVencimiento!: string;
  @Column({ type: 'decimal', precision: 14, scale: 2, nullable: true }) totalInteres?: number;
  @Column({ type: 'decimal', precision: 14, scale: 2, nullable: true }) totalAPagar?: number;
  @Column({ type: 'decimal', precision: 14, scale: 2, nullable: true }) saldoCapital?: number;
  @Column({ type: 'decimal', precision: 14, scale: 2, nullable: true }) saldoInteres?: number;
  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 }) saldoMora!: number;
  @Column({ type: 'decimal', precision: 14, scale: 2, nullable: true }) saldoTotal?: number;
  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 }) totalPagado!: number;
  @Column({ type: 'int', default: 0 }) diasMoraActual!: number;
  @Column({ type: 'int', default: 0 }) cuotasVencidas!: number;
  @Column({ length: 20, default: 'al_dia' }) estado!: string;
  @Column({ type: 'int', nullable: true }) oficialId?: number;
  @Column({ length: 200, nullable: true }) oficialNombre?: string;
  @Column({ type: 'int', nullable: true }) refinanciaDe?: number;
  @Column({ type: 'int', nullable: true }) facturaDesembolsoId?: number;
  @Column({ type: 'int', nullable: true }) vehiculoId?: number;
  @Column({ type: 'text', nullable: true }) notas?: string;
  /**
   * Motor v2 (Etapa 2, Fase 2A/2B) — 'v1': generado por amortizacion.util.ts
   * (Etapa 1, francés/alemán mensual), sigue leyéndose igual, NUNCA se
   * recalcula. 'v2': generado por prestamista/motor/amortizacion-v2.util.ts.
   * Todo préstamo nuevo se crea en 'v2' (ver PrestamosService
   * .crearEnTransaccion) — este campo decide, en mora.cron.ts, qué motor
   * de mora usar (mora.util.ts vs. motor/mora-v2.util.ts).
   */
  @Column({ length: 2, default: 'v1' }) motorVersion!: string;
  /**
   * Snapshot EXACTO de la configuración del motor usada para generar este
   * préstamo (frecuencia, tasa, método, gracia, cargos, mora) — copiado del
   * producto (+ ajustes de la solicitud) al momento del desembolso, nunca
   * leído en vivo del producto. Cambiar el producto después nunca altera
   * préstamos ya creados. `null` en préstamos 'v1'.
   */
  @Column({ type: 'jsonb', nullable: true }) motorConfig?: Record<string, unknown>;
  @CreateDateColumn() createdAt!: Date;
  @UpdateDateColumn() updatedAt!: Date;
}
