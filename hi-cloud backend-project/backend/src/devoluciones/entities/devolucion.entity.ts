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

  // Nota de Crédito E34 vinculada — la que esta devolución generó al
  // procesarse (flujo manual), o la que generó ESTA devolución al ser
  // aceptada por DGII (flujo NC → devolución, generadaDesdeNc=true).
  @Column({ nullable: true })
  notaCreditoId?: number;

  @Column({ length: 20, nullable: true })
  notaCreditoNumero?: string;

  /**
   * true si esta devolución nació de una NC de código 1/3 aceptada por DGII
   * (ver DevolucionesService.crearDesdeNotaCredito) — nunca la toca
   * procesar(). Sin este flag, una manual y una nacida de NC quedan
   * idénticas por fuera después de procesar() (las dos terminan con
   * notaCreditoId asignado), y la lista no podría mostrar el origen real.
   */
  @Column({ default: false })
  generadaDesdeNc!: boolean;
}
