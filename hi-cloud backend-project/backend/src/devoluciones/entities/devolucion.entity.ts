import { Entity, Column, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { Factura } from '../../facturas/entities/factura.entity';
import { Cliente } from '../../clientes/entities/cliente.entity';
import { User } from '../../users/users.entity';
import { DevolucionDetalle } from './devolucion-detalle.entity';
import { TenantScoped } from '../../tenant/decorators/tenant-scoped.decorator';

export enum TipoDevolucion {
  TOTAL   = 'total',
  PARCIAL = 'parcial',
}

export enum EstadoDevolucion {
  PENDIENTE = 'pendiente',
  PROCESADA = 'procesada',
  ANULADA   = 'anulada',
}

@TenantScoped()
@Entity('devoluciones')
export class Devolucion extends BaseEntity {
  @Column({ nullable: true })
  empresaId?: number;

  @Column({ length: 20, unique: true })
  numero!: string;

  @Column({ type: 'date' })
  fecha!: Date;

  @Column({ type: 'enum', enum: TipoDevolucion, default: TipoDevolucion.TOTAL })
  tipo!: TipoDevolucion;

  @Column({ type: 'enum', enum: EstadoDevolucion, default: EstadoDevolucion.PENDIENTE })
  estado!: EstadoDevolucion;

  @ManyToOne(() => Factura, { eager: true })
  @JoinColumn({ name: 'facturaId' })
  factura!: Factura;

  @Column()
  facturaId!: number;

  @ManyToOne(() => Cliente, { eager: true })
  @JoinColumn({ name: 'clienteId' })
  cliente!: Cliente;

  @Column()
  clienteId!: number;

  @Column({ type: 'text' })
  motivo!: string;

  @OneToMany(() => DevolucionDetalle, d => d.devolucion, { cascade: true, eager: true })
  detalles!: DevolucionDetalle[];

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  subtotal!: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  iva!: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  total!: number;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user!: User;

  @Column()
  userId!: number;

  // Nota de Crédito E34 generada automáticamente al procesar
  @Column({ nullable: true })
  notaCreditoId?: number;

  @Column({ length: 20, nullable: true })
  notaCreditoNumero?: string;
}
