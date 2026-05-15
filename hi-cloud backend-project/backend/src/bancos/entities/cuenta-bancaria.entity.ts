import { Entity, Column, Index } from 'typeorm';
import { TenantBaseEntity } from '../../common/entities/tenant-base.entity';
import { TenantScoped } from '../../tenant/decorators/tenant-scoped.decorator';

export enum TipoCuenta {
  CORRIENTE   = 'corriente',
  AHORROS     = 'ahorros',
  EMPRESARIAL = 'empresarial',
}

@TenantScoped()
@Entity('cuentas_bancarias')
@Index(['empresaId', 'isActive'])
export class CuentaBancaria extends TenantBaseEntity {
  @Column({ length: 100 })
  nombre!: string;

  @Column({ length: 60 })
  banco!: string;

  @Column({ length: 30 })
  numeroCuenta!: string;

  @Column({ type: 'enum', enum: TipoCuenta, default: TipoCuenta.CORRIENTE })
  tipo!: TipoCuenta;

  @Column({ length: 3, default: 'DOP' })
  moneda!: string;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  saldoInicial!: number;

  @Column({ type: 'text', nullable: true })
  descripcion?: string;
}
