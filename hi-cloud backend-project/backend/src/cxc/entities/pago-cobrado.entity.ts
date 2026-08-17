import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { MetodoPago } from '../../common/enums/metodo-pago.enum';
import { CuentaPorCobrar } from './cuenta-por-cobrar.entity';
import { User } from '../../users/users.entity';

@Entity('pagos_cobrados')
export class PagoCobrado extends BaseEntity {
  @ManyToOne(() => CuentaPorCobrar, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'cuentaPorCobrarId' })
  cuentaPorCobrar!: CuentaPorCobrar;

  @Column()
  cuentaPorCobrarId!: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  monto!: number;

  @Column({ type: 'date' })
  fecha!: Date;

  @Column({ type: 'enum', enum: MetodoPago })
  metodoPago!: MetodoPago;

  @Column({ length: 100, nullable: true })
  referencia?: string;

  @Column({ type: 'text', nullable: true })
  notas?: string;

  /** Moneda del pago (hereda de la CxC) */
  @Column({ length: 3, default: 'DOP' })
  moneda!: string;

  /** Tasa de cambio al momento del pago */
  @Column({ type: 'decimal', precision: 10, scale: 4, default: 1 })
  tipoCambio!: number;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user!: User;

  @Column()
  userId!: number;

  /** empresaId — ya existía en BD (migración anterior), lo declaramos en entidad */
  @Column({ nullable: true })
  empresaId?: number;

  /** Número secuencial por empresa — RDP-00001, RDP-00002, … */
  @Column({ length: 20 })
  numero!: string;
}
