import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('pr_pagos')
@Index(['empresaId', 'claveIdempotencia'], { unique: true, where: '"claveIdempotencia" IS NOT NULL' })
export class PrPago {
  @PrimaryGeneratedColumn() id!: number;
  @Column() empresaId!: number;
  @Column({ length: 20, nullable: true }) numero?: string;
  @Column() prestamoId!: number;
  @Column() deudorId!: number;
  @Column({ type: 'timestamp', default: () => 'NOW()' }) fecha!: Date;
  @Column({ type: 'decimal', precision: 12, scale: 2 }) montoPagado!: number;
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 }) aplicadoMora!: number;
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 }) aplicadoInteres!: number;
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 }) aplicadoCapital!: number;
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 }) aplicadoCargos!: number;
  @Column({ length: 50, nullable: true }) metodoPago?: string;
  @Column({ length: 100, nullable: true }) referencia?: string;
  @Column({ type: 'int', nullable: true }) cobradorId?: number;
  @Column({ length: 200, nullable: true }) cobradorNombre?: string;
  @Column({ type: 'jsonb', nullable: true }) cuotasAfectadas?: any;
  /** Registrar Pago (precursor de Etapa 2): 'cuotas' | 'abono_parcial' | 'abono_extraordinario_capital' | 'liquidar'. */
  @Column({ length: 40, default: 'cuotas' }) tipoPago!: string;
  /** Pago mixto: [{ metodo, monto, referencia? }] — null si fue una sola forma de pago. */
  @Column({ type: 'jsonb', nullable: true }) formasPago?: any;
  /** Parte del monto que redujo capital directo (fuera del plan de cuotas) — abono_extraordinario_capital o destinoExcedente='capital'. */
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 }) montoExtraCapital!: number;
  @Column({ type: 'int', nullable: true }) facturaId?: number;
  @Column({ type: 'int', nullable: true }) reciboId?: number;
  @Column({ type: 'text', nullable: true }) notas?: string;
  // C1: ver PagosService.registrar() y el índice único (empresaId, claveIdempotencia)
  // arriba — es lo que cierra la carrera de un doble clic/reintento de red.
  @Column({ length: 36, nullable: true, default: null }) claveIdempotencia?: string;
  @CreateDateColumn() createdAt!: Date;
}
