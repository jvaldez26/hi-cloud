import { Entity, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { TenantBaseEntity } from '../../common/entities/tenant-base.entity';
import { Cliente } from '../../clientes/entities/cliente.entity';
import { User } from '../../users/users.entity';
import { TenantScoped } from '../../tenant/decorators/tenant-scoped.decorator';

export enum EstadoContrato {
  ACTIVO     = 'activo',
  VENCIDO    = 'vencido',
  CANCELADO  = 'cancelado',
  SUSPENDIDO = 'suspendido',
}

export enum PeriodoFacturacion {
  MENSUAL    = 'mensual',
  BIMESTRAL  = 'bimestral',
  TRIMESTRAL = 'trimestral',
  SEMESTRAL  = 'semestral',
  ANUAL      = 'anual',
}

@TenantScoped()
@Entity('contratos')
@Index(['empresaId', 'isActive'])
@Index(['empresaId', 'estado'])
export class Contrato extends TenantBaseEntity {
  @Column({ length: 20 })
  numero!: string;

  @ManyToOne(() => Cliente, { eager: true })
  @JoinColumn({ name: 'clienteId' })
  cliente!: Cliente;

  @Column()
  clienteId!: number;

  @Column({ length: 200 })
  nombre!: string;

  @Column({ type: 'text' })
  descripcionServicio!: string;

  @Column({ type: 'enum', enum: EstadoContrato, default: EstadoContrato.ACTIVO })
  estado!: EstadoContrato;

  @Column({ type: 'date' })
  fechaInicio!: Date;

  @Column({ type: 'date', nullable: true })
  fechaFin?: Date;

  @Column({ type: 'enum', enum: PeriodoFacturacion, default: PeriodoFacturacion.MENSUAL })
  periodoFacturacion!: PeriodoFacturacion;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  montoBase!: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 18 })
  porcentajeIva!: number;

  @Column({ type: 'int', default: 1 })
  diaFacturacion!: number;

  @Column({ type: 'date', nullable: true })
  ultimaFactura?: Date;

  @Column({ type: 'date', nullable: true })
  proximaFactura?: Date;

  @Column({ type: 'int', default: 0 })
  totalFacturasGeneradas!: number;

  @Column({ default: true })
  facturaAutomatica!: boolean;

  @Column({ type: 'text', nullable: true })
  terminos?: string;

  @Column()
  userId!: number;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user!: User;
}
