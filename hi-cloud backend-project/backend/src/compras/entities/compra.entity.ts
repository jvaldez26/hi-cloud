import { Entity, Column, ManyToOne, OneToMany, JoinColumn, Index } from 'typeorm';
import { TenantBaseEntity } from '../../common/entities/tenant-base.entity';
import { Proveedor } from '../../proveedores/entities/proveedor.entity';
import { CompraDetalle } from './compra-detalle.entity';
import { User } from '../../users/users.entity';

export enum CompraEstado {
  BORRADOR  = 'borrador',
  RECIBIDA  = 'recibida',
  PAGADA    = 'pagada',
  CANCELADA = 'cancelada',
}

@Entity('compras')
@Index(['empresaId', 'isActive'])
@Index(['empresaId', 'estado'])
export class Compra extends TenantBaseEntity {
  @Column({ length: 20 })
  folio!: string;

  @Column({ type: 'date' })
  fecha!: Date;

  @Column({ type: 'enum', enum: CompraEstado, default: CompraEstado.BORRADOR })
  estado!: CompraEstado;

  @ManyToOne(() => Proveedor, { eager: true })
  @JoinColumn({ name: 'proveedorId' })
  proveedor!: Proveedor;

  @Column()
  proveedorId!: number;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'usuarioId' })
  usuario!: User;

  @Column()
  usuarioId!: number;

  @OneToMany(() => CompraDetalle, (d) => d.compra, { cascade: true, eager: true })
  detalles!: CompraDetalle[];

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  subtotal!: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  itbis!: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  total!: number;

  @Column({ length: 50, nullable: true })
  numeroFacturaProveedor?: string;

  @Column({ nullable: true })
  sucursalId?: number;

  @Column({ type: 'text', nullable: true })
  notas?: string;

  // ── Campos DGII 606 ────────────────────────────────────────────────────────
  /** Tipo de bienes/servicios según tabla DGII (01-11). Default: '09' */
  @Column({ length: 2, nullable: true, default: '09' })
  tipoBienes?: string;

  /** Forma de pago según códigos DGII (01-07). Default: '04' (crédito) */
  @Column({ length: 2, nullable: true, default: '04' })
  formaPago?: string;

  /** Fecha efectiva de pago (puede diferir de fecha del comprobante) */
  @Column({ type: 'date', nullable: true })
  fechaPago?: Date;
}
