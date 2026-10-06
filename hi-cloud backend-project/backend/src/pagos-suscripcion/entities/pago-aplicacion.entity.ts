import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
} from 'typeorm';

/**
 * Registro de a qué CARGO se aplicó un pago/crédito — el "a qué se aplicó
 * cada pago" del Historial. Antes un pago liquidaba un cargo (actualizaba
 * `pagos_suscripcion.montoPagado`) sin dejar ningún rastro de CUÁL pago lo
 * liquidó; para reconstruirlo había que adivinar por fecha y monto.
 *
 * Una fila por cargo liquidado — un solo pago puede liquidar varios cargos
 * (FIFO, ver imputacion-pago.util.ts), así que esto es 1:N desde `pagoId`.
 */
@Entity('pagos_aplicaciones')
export class PagoAplicacion {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  empresaId: number;

  /** El pago/crédito que aportó el dinero (pagos_suscripcion.id, tipo != 'CARGO'). */
  @Column()
  pagoId: number;

  /** El cargo liquidado, total o parcialmente (pagos_suscripcion.id, tipo = 'CARGO'). */
  @Column()
  cargoId: number;

  @Column({ type: 'numeric', precision: 10, scale: 2 })
  montoAplicado: number;

  @CreateDateColumn({ name: 'creadoEn' })
  creadoEn: Date;
}
