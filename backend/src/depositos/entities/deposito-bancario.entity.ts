import { Entity, Column, Index } from 'typeorm';
import { TenantBaseEntity } from '../../common/entities/tenant-base.entity';

export enum TipoDeposito {
  EFECTIVO         = 'efectivo',
  CHEQUE           = 'cheque',
  TRANSFERENCIA    = 'transferencia',
  PAGO_TARJETA     = 'pago_tarjeta',
  OTRO             = 'otro',
}

@Entity('depositos_bancarios')
@Index(['empresaId', 'isActive'])
@Index(['empresaId', 'cuentaId'])
@Index(['empresaId', 'fecha'])
export class DepositoBancario extends TenantBaseEntity {
  @Column({ length: 20 })
  numero!: string;

  @Column()
  cuentaId!: number;

  @Column({ type: 'date' })
  fecha!: string;

  @Column({ type: 'enum', enum: TipoDeposito, default: TipoDeposito.EFECTIVO })
  tipo!: TipoDeposito;

  @Column({ type: 'decimal', precision: 14, scale: 2 })
  monto!: number;

  @Column({ length: 100, nullable: true })
  referencia?: string;

  @Column({ length: 200, nullable: true })
  descripcion?: string;

  @Column({ nullable: true })
  clienteId?: number;

  @Column({ length: 200, nullable: true })
  nombreDepositante?: string;

  @Column({ nullable: true })
  cxcId?: number;

  @Column()
  usuarioId!: number;

  @Column({ type: 'text', nullable: true })
  notas?: string;
}
