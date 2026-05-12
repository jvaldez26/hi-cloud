import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { CuentaBancaria } from './cuenta-bancaria.entity';
import { User } from '../../users/users.entity';

export enum TipoMovimientoBancario {
  DEPOSITO              = 'deposito',
  RETIRO                = 'retiro',
  TRANSFERENCIA_ENTRADA = 'transferencia_entrada',
  TRANSFERENCIA_SALIDA  = 'transferencia_salida',
  NOTA_CREDITO          = 'nota_credito',
  NOTA_DEBITO           = 'nota_debito',
  COMISION              = 'comision',
  INTERES               = 'interes',
}

export enum OrigenMovimiento {
  MANUAL        = 'manual',
  COBRO_CXC     = 'cobro_cxc',
  PAGO_CXP      = 'pago_cxp',
  NOMINA        = 'nomina',
  TRANSFERENCIA = 'transferencia',
}

// Entradas: DEPOSITO, TRANSFERENCIA_ENTRADA, NOTA_CREDITO, INTERES
// Salidas:  RETIRO, TRANSFERENCIA_SALIDA, NOTA_DEBITO, COMISION
export const TIPOS_ENTRADA = [
  TipoMovimientoBancario.DEPOSITO,
  TipoMovimientoBancario.TRANSFERENCIA_ENTRADA,
  TipoMovimientoBancario.NOTA_CREDITO,
  TipoMovimientoBancario.INTERES,
];

@Entity('movimientos_bancarios')
export class MovimientoBancario extends BaseEntity {
  @ManyToOne(() => CuentaBancaria, { eager: true })
  @JoinColumn({ name: 'cuentaBancariaId' })
  cuentaBancaria!: CuentaBancaria;

  @Column()
  cuentaBancariaId!: number;

  @Column({ type: 'enum', enum: TipoMovimientoBancario })
  tipo!: TipoMovimientoBancario;

  @Column({ type: 'decimal', precision: 14, scale: 2 })
  monto!: number;

  @Column({ type: 'date' })
  fecha!: Date;

  @Column({ length: 300 })
  descripcion!: string;

  @Column({ length: 50, nullable: true })
  referencia?: string;

  @Column({ type: 'enum', enum: OrigenMovimiento, default: OrigenMovimiento.MANUAL })
  origen!: OrigenMovimiento;

  @Column({ nullable: true })
  origenId?: number;

  @Column({ type: 'decimal', precision: 14, scale: 2 })
  saldoAnterior!: number;

  @Column({ type: 'decimal', precision: 14, scale: 2 })
  saldoNuevo!: number;

  @Column({ default: false })
  conciliado!: boolean;

  @Column({ type: 'date', nullable: true })
  fechaConciliacion?: Date;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user!: User;

  @Column()
  userId!: number;
}
