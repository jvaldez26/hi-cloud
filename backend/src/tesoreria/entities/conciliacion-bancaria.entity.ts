import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { CuentaBancaria } from './cuenta-bancaria.entity';
import { User } from '../../users/users.entity';

export enum EstadoConciliacion {
  BORRADOR    = 'borrador',
  EN_PROCESO  = 'en_proceso',
  CERRADA     = 'cerrada',
}

@Entity('conciliaciones_bancarias')
export class ConciliacionBancaria extends BaseEntity {
  @ManyToOne(() => CuentaBancaria, { eager: true })
  @JoinColumn({ name: 'cuentaBancariaId' })
  cuentaBancaria!: CuentaBancaria;

  @Column()
  cuentaBancariaId!: number;

  @Column({ length: 7 })
  periodo!: string;

  @Column({ type: 'date' })
  fechaInicio!: Date;

  @Column({ type: 'date' })
  fechaFin!: Date;

  @Column({ type: 'decimal', precision: 14, scale: 2 })
  saldoExtracto!: number;

  @Column({ type: 'decimal', precision: 14, scale: 2 })
  saldoSistema!: number;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  diferencia!: number;

  @Column({ type: 'enum', enum: EstadoConciliacion, default: EstadoConciliacion.BORRADOR })
  estado!: EstadoConciliacion;

  @Column({ type: 'int', default: 0 })
  movimientosConciliados!: number;

  @Column({ type: 'int', default: 0 })
  movimientosPendientes!: number;

  @Column({ type: 'text', nullable: true })
  notas?: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user!: User;

  @Column()
  userId!: number;
}
