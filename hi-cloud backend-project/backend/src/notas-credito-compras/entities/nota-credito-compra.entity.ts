import { Entity, Column, OneToMany, JoinColumn, ManyToOne, Index } from 'typeorm';
import { TenantBaseEntity } from '../../common/entities/tenant-base.entity';
import { Proveedor } from '../../proveedores/entities/proveedor.entity';
import { NotaCreditoCompraDetalle } from './nota-credito-compra-detalle.entity';
import { TenantScoped } from '../../tenant/decorators/tenant-scoped.decorator';

export enum EstadoNCCompra {
  BORRADOR  = 'borrador',
  RECIBIDA  = 'recibida',
  ANULADA   = 'anulada',
}

export enum MotivoNCCompra {
  DEVOLUCION   = 'devolucion',
  DEFECTO      = 'defecto',
  DESCUENTO    = 'descuento',
  ERROR_PRECIO = 'error_precio',
  OTRO         = 'otro',
}

@TenantScoped()
@Entity('notas_credito_compras')
@Index(['empresaId', 'isActive'])
@Index(['empresaId', 'proveedorId'])
export class NotaCreditoCompra extends TenantBaseEntity {
  @Column({ length: 20 })
  numero!: string;

  @Column({ type: 'date' })
  fecha!: Date;

  @ManyToOne(() => Proveedor, { eager: true })
  @JoinColumn({ name: 'proveedorId' })
  proveedor!: Proveedor;

  @Column()
  proveedorId!: number;

  @Column({ nullable: true })
  compraOriginalId?: number;

  @Column({ length: 20, nullable: true })
  compraOriginalFolio?: string;

  @Column({ type: 'enum', enum: MotivoNCCompra, default: MotivoNCCompra.DEVOLUCION })
  motivo!: MotivoNCCompra;

  @Column({ type: 'text', nullable: true })
  descripcionMotivo?: string;

  @OneToMany(() => NotaCreditoCompraDetalle, d => d.notaCreditoCompra, { cascade: true, eager: true })
  detalles!: NotaCreditoCompraDetalle[];

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  subtotal!: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  iva!: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  total!: number;

  @Column({ type: 'enum', enum: EstadoNCCompra, default: EstadoNCCompra.BORRADOR })
  estado!: EstadoNCCompra;

  @Column()
  usuarioId!: number;

  @Column({ type: 'text', nullable: true })
  notas?: string;
}
