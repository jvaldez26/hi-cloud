import { Entity, Column } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';

export enum TipoCuentaBancaria {
  CORRIENTE = 'corriente',
  AHORROS   = 'ahorros',
  CREDITO   = 'credito',
}

export enum Moneda {
  DOP = 'DOP',
  USD = 'USD',
  EUR = 'EUR',
}

@Entity('cuentas_bancarias')
export class CuentaBancaria extends BaseEntity {
  @Column({ length: 100 })
  banco!: string;

  @Column({ length: 30, unique: true })
  numeroCuenta!: string;

  @Column({ type: 'enum', enum: TipoCuentaBancaria, default: TipoCuentaBancaria.CORRIENTE })
  tipoCuenta!: TipoCuentaBancaria;

  @Column({ type: 'enum', enum: Moneda, default: Moneda.DOP })
  moneda!: Moneda;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  saldo!: number;

  @Column({ default: true })
  isActiva!: boolean;

  @Column({ length: 200, nullable: true })
  descripcion?: string;
}
