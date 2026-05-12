import { Entity, Column, OneToMany, Index } from 'typeorm';
import { TenantBaseEntity } from '../../common/entities/tenant-base.entity';
import { Cuota } from './cuota.entity';

export enum EstadoPlanPago {
  VIGENTE   = 'vigente',
  COMPLETADO = 'completado',
  VENCIDO   = 'vencido',
  CANCELADO = 'cancelado',
}

@Entity('planes_pago')
@Index(['empresaId', 'isActive'])
@Index(['empresaId', 'clienteId'])
export class PlanPago extends TenantBaseEntity {
  @Column({ length: 20 })
  numero!: string;

  @Column()
  clienteId!: number;

  @Column({ length: 200, nullable: true })
  clienteNombre?: string;

  @Column({ nullable: true })
  facturaId?: number;

  @Column({ length: 20, nullable: true })
  facturaFolio?: string;

  @Column({ type: 'decimal', precision: 14, scale: 2 })
  montoTotal!: number;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  montoInicial!: number;

  @Column({ type: 'decimal', precision: 14, scale: 2 })
  montoFinanciar!: number;

  @Column({ type: 'int' })
  numeroCuotas!: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  tasaInteresMensual!: number;

  @Column({ type: 'decimal', precision: 14, scale: 2 })
  montoCuota!: number;

  @Column({ type: 'date' })
  fechaInicio!: string;

  @Column({ type: 'enum', enum: EstadoPlanPago, default: EstadoPlanPago.VIGENTE })
  estado!: EstadoPlanPago;

  @OneToMany(() => Cuota, c => c.planPago, { cascade: true, eager: false })
  cuotas!: Cuota[];

  @Column()
  usuarioId!: number;

  @Column({ type: 'text', nullable: true })
  notas?: string;
}
