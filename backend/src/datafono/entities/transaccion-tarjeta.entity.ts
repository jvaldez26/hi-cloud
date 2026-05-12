import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

export enum TipoTransaccion {
  VENTA      = 'venta',
  DEVOLUCION = 'devolucion',
  ANULACION  = 'anulacion',
}

export enum EstadoTransaccion {
  PENDIENTE    = 'pendiente',
  CONCILIADO   = 'conciliado',
  DISCREPANCIA = 'discrepancia',
}

@Entity('transacciones_tarjeta')
export class TransaccionTarjeta {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column({ nullable: true })
  empresaId?: number;

  @Column()
  terminalId: number;

  @Column({ type: 'date' })
  fecha: string;

  @Column({ length: 80 })
  referencia: string;

  @Column({ length: 10, nullable: true })
  tarjetaUltimos4?: string;

  @Column({ length: 30, default: TipoTransaccion.VENTA })
  tipo: string;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  monto: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  comision: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  neto: number;

  @Column({ length: 30, default: EstadoTransaccion.PENDIENTE })
  estado: string;

  @Column({ nullable: true })
  conciliacionId?: number;

  @Column({ type: 'text', nullable: true })
  notas?: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
