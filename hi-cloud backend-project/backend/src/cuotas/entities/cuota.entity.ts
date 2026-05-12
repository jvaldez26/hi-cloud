import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { PlanPago } from './plan-pago.entity';

export enum EstadoCuota {
  PENDIENTE = 'pendiente',
  PAGADA    = 'pagada',
  VENCIDA   = 'vencida',
  CANCELADA = 'cancelada',
}

@Entity('cuotas')
export class Cuota {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  planPagoId!: number;

  @ManyToOne(() => PlanPago, p => p.cuotas, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'planPagoId' })
  planPago!: PlanPago;

  @Column({ type: 'int' })
  numeroCuota!: number;

  @Column({ type: 'date' })
  fechaVencimiento!: string;

  @Column({ type: 'decimal', precision: 14, scale: 2 })
  monto!: number;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  montoPagado!: number;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  interes!: number;

  @Column({ type: 'enum', enum: EstadoCuota, default: EstadoCuota.PENDIENTE })
  estado!: EstadoCuota;

  @Column({ type: 'date', nullable: true })
  fechaPago?: string;

  @Column({ length: 100, nullable: true })
  referenciaPago?: string;
}
