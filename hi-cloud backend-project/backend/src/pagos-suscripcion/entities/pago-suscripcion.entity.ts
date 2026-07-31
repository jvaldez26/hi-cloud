import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn,
} from 'typeorm';

export enum TipoPago {
  TARJETA       = 'TARJETA',
  TRANSFERENCIA = 'TRANSFERENCIA',
  MANUAL        = 'MANUAL',
  CREDITO       = 'CREDITO',
  CARGO         = 'CARGO',
}

export enum EstadoPago {
  PENDIENTE   = 'PENDIENTE',
  CONFIRMADO  = 'CONFIRMADO',
  RECHAZADO   = 'RECHAZADO',
}

@Entity('pagos_suscripcion')
export class PagoSuscripcion {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  empresaId: number;

  @Column({ type: 'varchar', length: 20 })
  tipo: TipoPago;

  @Column({ type: 'text' })
  concepto: string;

  @Column({ type: 'numeric', precision: 10, scale: 2 })
  monto: number;

  @Column({ type: 'varchar', length: 20, default: EstadoPago.PENDIENTE })
  estado: EstadoPago;

  @Column({ type: 'text', nullable: true })
  comprobanteUrl: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  referencia: string | null;

  @Column({ type: 'text', nullable: true })
  notas: string | null;

  /** superAdminId que registró el pago (manual/cargo/crédito) */
  @Column({ type: 'int', nullable: true })
  registradoPor: number | null;

  @Column({ type: 'int', nullable: true })
  confirmadoPor: number | null;

  @Column({ type: 'text', nullable: true })
  motivoRechazo: string | null;

  @Column({ type: 'date', nullable: true })
  periodoInicio: Date | null;

  @Column({ type: 'date', nullable: true })
  periodoFin: Date | null;

  @CreateDateColumn({ name: 'creadoEn' })
  creadoEn: Date;

  @Column({ type: 'timestamptz', nullable: true })
  confirmadoEn: Date | null;
}
