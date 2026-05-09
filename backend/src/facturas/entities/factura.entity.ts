import { Entity, Column, ManyToOne, OneToMany, JoinColumn, Index } from 'typeorm';
import { TenantBaseEntity } from '../../common/entities/tenant-base.entity';
import { Cliente } from '../../clientes/entities/cliente.entity';
import { FacturaDetalle } from './factura-detalle.entity';
import { User } from '../../users/users.entity';

export enum FacturaEstado {
  BORRADOR  = 'borrador',
  EMITIDA   = 'emitida',
  PAGADA    = 'pagada',
  CANCELADA = 'cancelada',
}

@Entity('facturas')
@Index(['empresaId', 'isActive'])
@Index(['empresaId', 'estado'])
@Index(['empresaId', 'createdAt'])
export class Factura extends TenantBaseEntity {
  @Column({ length: 20 })
  folio!: string;

  @Column({ type: 'date' })
  fecha!: Date;

  @Column({ type: 'enum', enum: FacturaEstado, default: FacturaEstado.BORRADOR })
  estado!: FacturaEstado;

  @ManyToOne(() => Cliente, { eager: true, nullable: true })
  @JoinColumn({ name: 'clienteId' })
  cliente?: Cliente;

  @Column({ nullable: true })
  clienteId?: number;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'usuarioId' })
  usuario!: User;

  @Column()
  usuarioId!: number;

  @OneToMany(() => FacturaDetalle, (d) => d.factura, { cascade: true, eager: true })
  detalles!: FacturaDetalle[];

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  subtotal!: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  iva!: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  total!: number;

  @Column({ nullable: true })
  ecfId?: number;

  @Column({ length: 10, nullable: true, default: 'E32' })
  tipoNcf?: string;

  @Column({ nullable: true })
  sucursalId?: number;

  @Column({ nullable: true })
  vendedorId?: number;

  @Column({ length: 150, nullable: true })
  nombreVendedor?: string;

  // ── Multi-moneda ──────────────────────────────────────────────────────────────
  @Column({ length: 3, default: 'DOP' })
  moneda!: string;

  @Column({ type: 'decimal', precision: 10, scale: 4, default: 1 })
  tipoCambio!: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  totalOriginal?: number;

  @Column({ type: 'text', nullable: true })
  notas?: string;
}
