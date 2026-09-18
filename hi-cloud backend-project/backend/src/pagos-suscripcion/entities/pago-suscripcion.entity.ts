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

  /**
   * Solo tiene sentido en filas tipo=CARGO: cuánto de ese cargo ya se
   * liquidó vía imputación (registrarPago, confirmarTransferencia o un
   * crédito dirigido a este cargo). saldoPendiente = monto - montoPagado.
   */
  @Column({ type: 'numeric', precision: 10, scale: 2, default: 0 })
  montoPagado: number;

  @Column({ type: 'varchar', length: 20, default: EstadoPago.PENDIENTE })
  estado: EstadoPago;

  /**
   * Solo se usa cuando el comprobante se guardó con el fallback de disco
   * local (S3 deshabilitado) — ahí sí es una URL final y usable. Cuando
   * S3 está habilitado, el comprobante vive en "comprobanteKey" (key de S3,
   * nunca una URL pública — los buckets bloquean acceso público) y este
   * campo queda null. Ver migración 1763900000000-ComprobanteKeyPagosSuscripcion.
   */
  @Column({ type: 'text', nullable: true })
  comprobanteUrl: string | null;

  /** Key de S3 del comprobante — la URL se firma on-demand con getSignedUrl(), nunca se persiste. */
  @Column({ type: 'text', nullable: true })
  comprobanteKey: string | null;

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
