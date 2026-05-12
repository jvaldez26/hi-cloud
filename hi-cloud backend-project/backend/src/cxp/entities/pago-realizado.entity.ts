import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { MetodoPago } from '../../common/enums/metodo-pago.enum';
import { CuentaPorPagar } from './cuenta-por-pagar.entity';
import { User } from '../../users/users.entity';

@Entity('pagos_realizados')
export class PagoRealizado extends BaseEntity {
  @ManyToOne(() => CuentaPorPagar, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'cuentaPorPagarId' })
  cuentaPorPagar!: CuentaPorPagar;

  @Column()
  cuentaPorPagarId!: number;

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

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user!: User;

  @Column()
  userId!: number;
}
