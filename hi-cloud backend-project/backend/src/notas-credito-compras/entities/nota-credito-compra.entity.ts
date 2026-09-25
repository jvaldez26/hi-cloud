import { Entity, Column, OneToMany, JoinColumn, ManyToOne, Index } from 'typeorm';
import { TenantBaseEntity } from '../../common/entities/tenant-base.entity';
import { Proveedor } from '../../proveedores/entities/proveedor.entity';
import { Compra } from '../../compras/entities/compra.entity';
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

/**
 * Tipo de efecto de la NC — a diferencia de `motivo` (puramente descriptivo),
 * `tipo` decide si toca inventario y qué cuenta se acredita en el asiento.
 */
export enum TipoNCCompra {
  /** Mercancía SÍ entró y SÍ se devuelve físicamente — reversa de inventario. */
  DEVOLUCION_INVENTARIO = 'devolucion_inventario',
  /** Descuento / error de precio / daño sin devolver — no toca inventario. */
  AJUSTE_SIN_DEVOLUCION = 'ajuste_sin_devolucion',
  /** La OC/factura incluía algo que nunca llegó a entrar — no toca inventario. */
  NO_RECIBIDA = 'no_recibida',
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

  /** No eager — solo se trae cuando listar()/findOne() la piden con
   *  relations, para mostrar el NCF/documento que esta NC afecta
   *  (Compra.numeroFacturaProveedor — es el mismo dato que
   *  getFormato606() usa como "NCF Modificado"). */
  @ManyToOne(() => Compra, { nullable: true })
  @JoinColumn({ name: 'compraOriginalId' })
  compraOriginal?: Compra;

  @Column({ type: 'varchar', length: 30, default: TipoNCCompra.DEVOLUCION_INVENTARIO })
  tipo!: TipoNCCompra;

  /** NCF/e-NCF de la nota de crédito DEL PROVEEDOR (su E34/B04) — HiCloud
   *  no la emite, solo la registra. Nullable en BD por las NC anteriores a
   *  este campo; el DTO la exige en toda creación nueva. */
  @Column({ length: 50, nullable: true })
  ncfProveedor?: string;

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
